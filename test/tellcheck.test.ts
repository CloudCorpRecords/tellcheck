import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  callTellcheckTool,
  measureText,
  PRESETS,
  TellcheckStore,
  TOOL_NAMES,
} from "../src/tellcheck.js";

function freshStore(): TellcheckStore {
  return new TellcheckStore(mkdtempSync(join(tmpdir(), "tellcheck-test-")));
}

const SAMPLES = [
  "I don't ship on Fridays — ever. We broke prod twice that way. Never again.",
  "Short note. The deploy went fine, and the graphs look calm — don't touch anything until Monday, please.",
];

describe("presets and listing", () => {
  it("ships exactly 12 presets", () => {
    assert.equal(PRESETS.length, 12);
    const store = freshStore();
    const out = store.listStyles() as { styles: Array<{ kind: string }> };
    assert.equal(out.styles.filter((s) => s.kind === "preset").length, 12);
  });
  it("exposes all 20 tool names", () => {
    assert.equal(TOOL_NAMES.length, 20);
  });
  it("get_style_guide returns dials and rhythm for a preset", () => {
    const store = freshStore();
    const guide = store.getStyleGuide("founder-memo");
    assert.equal(guide.name, "Founder Memo");
    assert.equal(typeof guide.dials.formality, "number");
    assert.ok(guide.rhythm.length > 0);
  });
});

describe("style lifecycle", () => {
  it("train_style measures a baseline and persists across store instances", () => {
    const home = mkdtempSync(join(tmpdir(), "tellcheck-test-"));
    const a = new TellcheckStore(home);
    const trained = a.trainStyle("My Voice", SAMPLES) as {
      style: { id: string };
      baseline: { wordCount: number; contractionRate: number };
    };
    assert.ok(trained.baseline.wordCount > 10);
    assert.ok(trained.baseline.contractionRate > 0);
    const b = new TellcheckStore(home);
    const guide = b.getStyleGuide(trained.style.id);
    assert.equal(guide.kind, "trained");
    assert.equal(guide.sampleCount, 2);
  });
  it("create/update/fork/delete and default round-trip", () => {
    const store = freshStore();
    const created = store.createStyleFromDials("House Style", { formality: 0.9 }) as {
      style: { id: string; dials: { formality: number } };
    };
    assert.equal(created.style.dials.formality, 0.9);
    const updated = store.updateStyle(created.style.id, undefined, { warmth: 0.1 }) as {
      style: { dials: { warmth: number; formality: number } };
    };
    assert.equal(updated.style.dials.warmth, 0.1);
    assert.equal(updated.style.dials.formality, 0.9);
    const forked = store.forkStyle("executive-brief", "Exec Copy") as {
      style: { id: string };
      forkedFrom: string;
    };
    assert.equal(forked.forkedFrom, "executive-brief");
    store.updateStyle(forked.style.id, "Exec Copy v2");
    store.setDefaultStyle(forked.style.id);
    const deleted = store.deleteStyle(forked.style.id);
    assert.equal(deleted.id, forked.style.id);
    assert.throws(() => store.getStyleGuide(forked.style.id), /Unknown style/);
  });
  it("preset update/delete are refused with clear errors", () => {
    const store = freshStore();
    assert.throws(() => store.updateStyle("blog-post", "x"), /fork it first/);
    assert.throws(() => store.deleteStyle("blog-post"), /shipped preset/);
  });
  it("gallery fork returns an honest error", () => {
    const store = freshStore();
    assert.throws(() => store.forkStyle("@someone/their-style", "Copy"), /public-gallery/);
    assert.throws(() => store.forkStyle("gallery:some-style", "Copy"), /public-gallery/);
  });
});

describe("checks", () => {
  it("measureText counts sentences, contractions, and em dashes", () => {
    const stats = measureText(SAMPLES[0]);
    assert.ok(stats.sentenceCount >= 3);
    assert.ok(stats.contractionRate > 0);
    assert.ok(stats.emDashRate > 0);
  });
  it("check_voice_match scores similar text higher and flags short input", () => {
    const store = freshStore();
    const trained = store.trainStyle("Voice", SAMPLES) as { style: { id: string } };
    const similar = store.checkVoiceMatch(SAMPLES[0], trained.style.id);
    assert.ok(similar.score >= 0 && similar.score <= 100);
    const short = store.checkVoiceMatch("Hi there.", trained.style.id);
    assert.equal(short.confidence, "low");
    assert.ok(short.note && short.note.includes("Low confidence"));
  });
  it("check_self_repetition finds repeated openers and sample overlap", () => {
    const store = freshStore();
    const trained = store.trainStyle("Voice", SAMPLES) as { style: { id: string } };
    const text =
      "The deploy went fine. The deploy went fine again. The deploy went fine today. I don't ship on Fridays.";
    const out = store.checkSelfRepetition(text, trained.style.id);
    assert.ok(out.repeatedOpeners.length >= 1);
    assert.ok(out.repeatedAgainstTrainingSamples.includes("i don't ship"));
  });
});

describe("audit_text", () => {
  it("flags tell vocabulary with replacements and scores it down", () => {
    const store = freshStore();
    const out = store.auditText(
      "Our comprehensive, cutting-edge platform will leverage seamless tooling to streamline your workflow.",
    );
    const words = out.findings
      .filter((f) => f.type === "tell_vocabulary")
      .map((f) => f.message);
    assert.ok(words.some((m) => m.includes("comprehensive")));
    assert.ok(words.some((m) => m.includes("leverage")));
    assert.ok(out.findings.every((f) => f.type !== "tell_vocabulary" || f.replacement));
    assert.ok(out.score < 100);
    assert.notEqual(out.tier, "green");
  });
  it("clean specific text scores green and lists strengths", () => {
    const store = freshStore();
    const out = store.auditText(
      "On Tuesday we shipped the fix at 9:40. Error reports dropped from 212 to 17 in one day. I checked the logs twice.",
    );
    assert.equal(out.tier, "green");
    assert.ok(out.strengths.some((s) => s.includes("Specificity")));
  });
  it("docs register suppresses markdown-structure findings", () => {
    const store = freshStore();
    const text = "# Title\n\nSome **bold** claim here.";
    const docs = store.auditText(text, "docs");
    const blog = store.auditText(text, "blog");
    assert.ok(!docs.findings.some((f) => f.type === "markdown_structure"));
    assert.ok(blog.findings.some((f) => f.type === "markdown_structure"));
  });
  it("flags numbers missing from sourceFacts", () => {
    const store = freshStore();
    const out = store.auditText("Revenue grew 48% last quarter.", "general", [
      "Revenue grew last quarter.",
    ]);
    assert.ok(out.findings.some((f) => f.type === "unverified_number"));
  });
  it("second_read always fails honestly", () => {
    const store = freshStore();
    assert.throws(() => store.secondRead("anything"), /not available in the local install/);
  });
});

describe("dictionary and instructions", () => {
  it("global and per-style words merge into the effective list", () => {
    const store = freshStore();
    const trained = store.trainStyle("Voice", SAMPLES) as { style: { id: string } };
    store.addWord("banned", "synergy");
    store.addWord("banned", "holistic", trained.style.id);
    store.addWord("custom", "deployfreeze", trained.style.id);
    const dict = store.listDictionary(trained.style.id) as {
      global: { bannedWords: string[] };
      effective: { bannedWords: string[]; customWords: string[] };
    };
    assert.deepEqual(dict.global.bannedWords, ["synergy"]);
    assert.deepEqual(dict.effective.bannedWords.sort(), ["holistic", "synergy"]);
    assert.deepEqual(dict.effective.customWords, ["deployfreeze"]);
    store.removeWord("banned", "synergy");
    const after = store.listDictionary() as { global: { bannedWords: string[] } };
    assert.deepEqual(after.global.bannedWords, []);
  });
  it("banned words surface in audit findings", () => {
    const store = freshStore();
    store.addWord("banned", "synergy");
    const out = store.auditText("We need more synergy here.");
    assert.ok(out.findings.some((f) => f.type === "banned_word"));
  });
  it("instructions set/get/clear at global and style scope", () => {
    const store = freshStore();
    store.setInstructions("Always cite sources.");
    const global = store.getInstructions() as { instructions: string | null };
    assert.equal(global.instructions, "Always cite sources.");
    const trained = store.trainStyle("Voice", SAMPLES) as { style: { id: string } };
    store.setInstructions("No exclamation marks.", trained.style.id);
    const scoped = store.getInstructions(trained.style.id) as { effective: string | null };
    assert.equal(scoped.effective, "No exclamation marks.");
    store.clearInstructions(trained.style.id);
    const cleared = store.getInstructions(trained.style.id) as { effective: string | null };
    assert.equal(cleared.effective, "Always cite sources.");
    store.clearInstructions();
    const empty = store.getInstructions() as { instructions: string | null };
    assert.equal(empty.instructions, null);
  });
});

describe("dispatcher", () => {
  it("routes every tool name without an unknown-tool error", () => {
    const store = freshStore();
    const trained = store.trainStyle("Voice", SAMPLES) as { style: { id: string } };
    const id = trained.style.id;
    const calls: Array<[string, Record<string, unknown>]> = [
      ["list_styles", {}],
      ["get_style_guide", { styleId: id }],
      ["create_style_from_dials", { name: "Dials", dials: { formality: 0.5 } }],
      ["update_style", { styleId: id, name: "Voice 2" }],
      ["fork_style", { source: id, name: "Voice Fork" }],
      ["set_default_style", { styleId: id }],
      ["check_voice_match", { text: SAMPLES[0], styleId: id }],
      ["check_self_repetition", { text: SAMPLES[0], styleId: id }],
      ["audit_text", { text: "Plain words here." }],
      ["add_banned_word", { word: "synergy" }],
      ["remove_banned_word", { word: "synergy" }],
      ["add_custom_word", { word: "frobnicate" }],
      ["remove_custom_word", { word: "frobnicate" }],
      ["list_dictionary", {}],
      ["set_style_instructions", { instructions: "Be brief." }],
      ["get_style_instructions", {}],
      ["clear_style_instructions", {}],
      ["delete_style", { styleId: id }],
    ];
    for (const [name, args] of calls) callTellcheckTool(store, name, args);
    assert.throws(
      () => callTellcheckTool(store, "second_read", { text: "x" }),
      /not available in the local install/,
    );
    assert.throws(() => callTellcheckTool(store, "nope", {}), /Unknown tool/);
  });
});
