/**
 * tellcheck MCP server. 20 tools: style listing/guides, training, dial
 * styles, fork/update/delete/default, voice-match, self-repetition,
 * deterministic audit, second_read (honest local failure), dictionaries,
 * and style instructions.
 *
 * Why the low-level Server instead of McpServer: the high-level helper
 * converts zod schemas to JSON Schema and injects keys that are not in
 * this tool's public spec ("$schema" and "additionalProperties"), which
 * breaks exact tool-list/schema parity. This file serves tools/list
 * with the spec's exact input schemas as explicit literals, while zod
 * still validates every tools/call argument set. Schemas are documented
 * reconstructions from the README prose (docs-derived).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { callTellcheckTool, TellcheckStore, VERSION } from "./tellcheck.js";

const Dials = z.object({
  formality: z.number().optional(),
  warmth: z.number().optional(),
  directness: z.number().optional(),
  sentenceLength: z.number().optional(),
  sentenceRhythmVariance: z.number().optional(),
  paragraphVariance: z.number().optional(),
  contractionUse: z.number().optional(),
  emDashUse: z.number().optional(),
  fragmentTolerance: z.number().optional(),
  questionUse: z.number().optional(),
  entropy: z.number().optional(),
});

const DIALS_SCHEMA = {
  type: "object" as const,
  properties: {
    formality: { type: "number" as const },
    warmth: { type: "number" as const },
    directness: { type: "number" as const },
    sentenceLength: { type: "number" as const },
    sentenceRhythmVariance: { type: "number" as const },
    paragraphVariance: { type: "number" as const },
    contractionUse: { type: "number" as const },
    emDashUse: { type: "number" as const },
    fragmentTolerance: { type: "number" as const },
    questionUse: { type: "number" as const },
    entropy: { type: "number" as const },
  },
  description: "Voice dial values from 0 to 1, except sentenceLength, which is a target average in words.",
};

const Args = {
  list_styles: z.object({}),
  get_style_guide: z.object({ styleId: z.string() }),
  train_style: z.object({ name: z.string(), samples: z.array(z.string()) }),
  create_style_from_dials: z.object({ name: z.string(), dials: Dials }),
  update_style: z.object({
    styleId: z.string(),
    name: z.string().optional(),
    dials: Dials.optional(),
  }),
  fork_style: z.object({ source: z.string(), name: z.string() }),
  delete_style: z.object({ styleId: z.string() }),
  set_default_style: z.object({ styleId: z.string() }),
  check_voice_match: z.object({ text: z.string(), styleId: z.string() }),
  check_self_repetition: z.object({ text: z.string(), styleId: z.string() }),
  audit_text: z.object({
    text: z.string(),
    register: z.string().optional(),
    sourceFacts: z.array(z.string()).optional(),
  }),
  second_read: z.object({ text: z.string() }),
  add_banned_word: z.object({ word: z.string(), styleId: z.string().optional() }),
  remove_banned_word: z.object({ word: z.string(), styleId: z.string().optional() }),
  add_custom_word: z.object({ word: z.string(), styleId: z.string().optional() }),
  remove_custom_word: z.object({ word: z.string(), styleId: z.string().optional() }),
  list_dictionary: z.object({ styleId: z.string().optional() }),
  set_style_instructions: z.object({
    instructions: z.string(),
    styleId: z.string().optional(),
  }),
  clear_style_instructions: z.object({ styleId: z.string().optional() }),
  get_style_instructions: z.object({ styleId: z.string().optional() }),
} as const;

type ToolName = keyof typeof Args;

const TOOLS = [
  {
    name: "list_styles",
    description: "List available writing styles: shipped presets, trained styles, and a team style if one is defined.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_style_guide",
    description: "Get the full style guide for one style, including its dials and rhythm description.",
    inputSchema: {
      type: "object" as const,
      properties: { styleId: { type: "string" as const, description: "ID or name of the style." } },
      required: ["styleId"],
    },
  },
  {
    name: "train_style",
    description: "Train a new style from writing samples by measuring sentence rhythm, contraction rate, em-dash use, and paragraph variance.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string" as const, description: "Name for the new style." },
        samples: { type: "array" as const, items: { type: "string" as const }, description: "Writing sample texts to train the style from; at least one is required." },
      },
      required: ["name", "samples"],
    },
  },
  {
    name: "create_style_from_dials",
    description: "Create a style directly from voice dials without training samples.",
    inputSchema: {
      type: "object" as const,
      properties: { name: { type: "string" as const, description: "Name for the new style." }, dials: DIALS_SCHEMA },
      required: ["name", "dials"],
    },
  },
  {
    name: "update_style",
    description: "Rename a style or adjust its dials.",
    inputSchema: {
      type: "object" as const,
      properties: {
        styleId: { type: "string" as const, description: "ID of the style to update." },
        name: { type: "string" as const, description: "New name for the style." },
        dials: DIALS_SCHEMA,
      },
      required: ["styleId"],
    },
  },
  {
    name: "fork_style",
    description: "Fork an existing style under a new name. Preset forks are local; forking a public-gallery handle or slug may return an honest error in this rebuild.",
    inputSchema: {
      type: "object" as const,
      properties: { source: { type: "string" as const, description: "ID or name of the local style to fork." }, name: { type: "string" as const, description: "Name for the forked style." } },
      required: ["source", "name"],
    },
  },
  {
    name: "delete_style",
    description: "Delete a user-created style.",
    inputSchema: {
      type: "object" as const,
      properties: { styleId: { type: "string" as const, description: "ID of the style to delete." } },
      required: ["styleId"],
    },
  },
  {
    name: "set_default_style",
    description: "Set the default style used when no style is specified.",
    inputSchema: {
      type: "object" as const,
      properties: { styleId: { type: "string" as const, description: "ID or name of the style." } },
      required: ["styleId"],
    },
  },
  {
    name: "check_voice_match",
    description: "Compare a text's rhythm and mechanics against a style baseline. Short input returns a low-confidence note.",
    inputSchema: {
      type: "object" as const,
      properties: { text: { type: "string" as const, description: "Text to compare against the style." }, styleId: { type: "string" as const, description: "ID or name of the style." } },
      required: ["text", "styleId"],
    },
  },
  {
    name: "check_self_repetition",
    description: "Find repeated sentence openers and phrases in a text, including repetition against the style's training samples.",
    inputSchema: {
      type: "object" as const,
      properties: { text: { type: "string" as const, description: "Text to check for repetition." }, styleId: { type: "string" as const, description: "ID or name of the style." } },
      required: ["text", "styleId"],
    },
  },
  {
    name: "audit_text",
    description: "Run a deterministic AI-tell scan over a text and return a tier, score, findings with locations, and strengths.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: { type: "string" as const, description: "Text to audit." },
        register: { type: "string" as const, description: "Text register: email, blog, memo, essay, social, docs, general, or personal." },
        sourceFacts: { type: "array" as const, items: { type: "string" as const }, description: "Source fact texts that numbers in the text are checked against." },
      },
      required: ["text"],
    },
  },
  {
    name: "second_read",
    description: "Request a second read of a text. The original's local install always fails with a clear explanation; this rebuild reproduces that honest behaviour.",
    inputSchema: {
      type: "object" as const,
      properties: { text: { type: "string" as const, description: "Text to request a second read of." } },
      required: ["text"],
    },
  },
  {
    name: "add_banned_word",
    description: "Add a word to the banned-word list, globally or for one style.",
    inputSchema: {
      type: "object" as const,
      properties: { word: { type: "string" as const, description: "Word to add to the banned-word list." }, styleId: { type: "string" as const, description: "ID or name of the style; omit for the global list." } },
      required: ["word"],
    },
  },
  {
    name: "remove_banned_word",
    description: "Remove a word from the banned-word list, globally or for one style.",
    inputSchema: {
      type: "object" as const,
      properties: { word: { type: "string" as const, description: "Word to remove from the banned-word list." }, styleId: { type: "string" as const, description: "ID or name of the style; omit for the global list." } },
      required: ["word"],
    },
  },
  {
    name: "add_custom_word",
    description: "Add a word to the custom dictionary, globally or for one style.",
    inputSchema: {
      type: "object" as const,
      properties: { word: { type: "string" as const, description: "Word to add to the custom dictionary." }, styleId: { type: "string" as const, description: "ID or name of the style; omit for the global dictionary." } },
      required: ["word"],
    },
  },
  {
    name: "remove_custom_word",
    description: "Remove a word from the custom dictionary, globally or for one style.",
    inputSchema: {
      type: "object" as const,
      properties: { word: { type: "string" as const, description: "Word to remove from the custom dictionary." }, styleId: { type: "string" as const, description: "ID or name of the style; omit for the global dictionary." } },
      required: ["word"],
    },
  },
  {
    name: "list_dictionary",
    description: "List dictionary scopes and, when a style is given, the merged effective list for that style.",
    inputSchema: {
      type: "object" as const,
      properties: { styleId: { type: "string" as const, description: "ID or name of the style; omit to list only the global scopes." } },
    },
  },
  {
    name: "set_style_instructions",
    description: "Set free-form style instructions, globally or for one style.",
    inputSchema: {
      type: "object" as const,
      properties: {
        instructions: { type: "string" as const, description: "Free-form style instructions text." },
        styleId: { type: "string" as const, description: "ID or name of the style; omit for the global instructions." },
      },
      required: ["instructions"],
    },
  },
  {
    name: "clear_style_instructions",
    description: "Clear style instructions, globally or for one style.",
    inputSchema: {
      type: "object" as const,
      properties: { styleId: { type: "string" as const, description: "ID or name of the style; omit for the global instructions." } },
    },
  },
  {
    name: "get_style_instructions",
    description: "Get style instructions, globally or for one style.",
    inputSchema: {
      type: "object" as const,
      properties: { styleId: { type: "string" as const, description: "ID or name of the style; omit for the global instructions." } },
    },
  },
];

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const store = new TellcheckStore();

const server = new Server(
  { name: "tellcheck", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const schema = Args[name as ToolName] as z.ZodTypeAny | undefined;
  if (!schema) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  try {
    const parsed = schema.parse(args ?? {}) as Record<string, unknown>;
    return textResult(callTellcheckTool(store, name, parsed));
  } catch (err) {
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
