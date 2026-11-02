#!/usr/bin/env node
/**
 * tellcheck CLI.
 *
 *   tellcheck <tool-name> '<json-arguments>'
 *   tellcheck mcp
 *   tellcheck --version
 *
 * One subcommand per MCP tool; the argument is a single JSON object,
 * e.g. tellcheck audit_text '{"text":"...","register":"blog"}'.
 * Exit codes: 0 success, 1 tool error, 2 usage error.
 * State lives under TELLCHECK_HOME or ~/.tellcheck.
 */
import { callTellcheckTool, TellcheckStore, TOOL_NAMES, VERSION } from "./tellcheck.js";

function usage(): never {
  console.error(`Usage:
  tellcheck <tool-name> '<json-arguments>'
  tellcheck mcp
  tellcheck --version
Tools: ${TOOL_NAMES.join(", ")}`);
  process.exit(2);
}

async function main(): Promise<void> {
  const [cmd, jsonArg] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd || !(TOOL_NAMES as readonly string[]).includes(cmd)) usage();
  let args: Record<string, unknown> = {};
  if (jsonArg) {
    try {
      args = JSON.parse(jsonArg) as Record<string, unknown>;
    } catch {
      console.error("error: arguments must be a JSON object");
      process.exit(2);
    }
  }
  try {
    const store = new TellcheckStore();
    const result = callTellcheckTool(store, cmd, args);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
