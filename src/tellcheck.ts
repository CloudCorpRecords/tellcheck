/**
 * tellcheck core: voice styles, a deterministic AI-tell audit, voice-match
 * and self-repetition checks, dictionaries, and style instructions.
 *
 * Clean-room implementation written from the public README prose of the
 * original tool. The tell vocabulary, replacements, presets, and scoring
 * rules below are original to this rebuild, built from the examples the
 * README names. Everything is local and deterministic: no network, no
 * API key. State persists as JSON under TELLCHECK_HOME or ~/.tellcheck.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  AuditFinding,
  AuditResult,
  PartialDials,
  StoreData,
  StyleRecord,
  TextStats,
  VoiceDials,
  VoiceMatchResult,
} from "./types.js";

export const VERSION = "0.1.0";

/* ------------------------------------------------------------------ */
/* Presets                                                             */
/* ------------------------------------------------------------------ */

function dials(partial: PartialDials): VoiceDials {
  return {
    formality: 0.5,
    warmth: 0.5,
    directness: 0.5,
    sentenceLength: 16,
    sentenceRhythmVariance: 0.5,
    paragraphVariance: 0.5,
    contractionUse: 0.5,
    emDashUse: 0.3,
    fragmentTolerance: 0.3,
    questionUse: 0.2,
    entropy: 0.5,
    ...partial,
  };
}

export const PRESETS: Array<{
  id: string;
  name: string;
  dials: VoiceDials;
  rhythm: string;
}> = [
  { id: "direct-and-warm", name: "Direct & Warm", dials: dials({ formality: 0.35, warmth: 0.85, directness: 0.85, sentenceLength: 14, sentenceRhythmVariance: 0.45, paragraphVariance: 0.5, contractionUse: 0.8, emDashUse: 0.3, fragmentTolerance: 0.6, questionUse: 0.35, entropy: 0.5 }), rhythm: "Short, clear sentences. Warmth comes from plain words, not padding." },
  { id: "executive-brief", name: "Executive Brief", dials: dials({ formality: 0.85, warmth: 0.3, directness: 0.9, sentenceLength: 15, sentenceRhythmVariance: 0.3, paragraphVariance: 0.3, contractionUse: 0.15, emDashUse: 0.1, fragmentTolerance: 0.2, questionUse: 0.05, entropy: 0.3 }), rhythm: "Tight, even sentences. Point first, evidence second, no throat-clearing." },
  { id: "reflective-essayist", name: "Reflective Essayist", dials: dials({ formality: 0.6, warmth: 0.6, directness: 0.4, sentenceLength: 22, sentenceRhythmVariance: 0.75, paragraphVariance: 0.7, contractionUse: 0.45, emDashUse: 0.6, fragmentTolerance: 0.35, questionUse: 0.3, entropy: 0.65 }), rhythm: "Long, winding sentences broken by short reflective beats." },
  { id: "founder-memo", name: "Founder Memo", dials: dials({ formality: 0.45, warmth: 0.55, directness: 0.9, sentenceLength: 13, sentenceRhythmVariance: 0.5, paragraphVariance: 0.45, contractionUse: 0.7, emDashUse: 0.4, fragmentTolerance: 0.65, questionUse: 0.2, entropy: 0.45 }), rhythm: "Punchy and decisive. One idea per line, verdicts up front." },
  { id: "plainspoken-analyst", name: "Plainspoken Analyst", dials: dials({ formality: 0.55, warmth: 0.35, directness: 0.8, sentenceLength: 17, sentenceRhythmVariance: 0.35, paragraphVariance: 0.35, contractionUse: 0.3, emDashUse: 0.15, fragmentTolerance: 0.25, questionUse: 0.1, entropy: 0.35 }), rhythm: "Measured, even sentences. Numbers carry the argument." },
  { id: "wry-and-candid", name: "Wry & Candid", dials: dials({ formality: 0.25, warmth: 0.5, directness: 0.85, sentenceLength: 13, sentenceRhythmVariance: 0.7, paragraphVariance: 0.6, contractionUse: 0.85, emDashUse: 0.55, fragmentTolerance: 0.75, questionUse: 0.3, entropy: 0.7 }), rhythm: "Dry asides and short jabs between longer, looser sentences." },
  { id: "pr-review", name: "PR Review", dials: dials({ formality: 0.5, warmth: 0.4, directness: 0.9, sentenceLength: 12, sentenceRhythmVariance: 0.4, paragraphVariance: 0.3, contractionUse: 0.5, emDashUse: 0.2, fragmentTolerance: 0.5, questionUse: 0.25, entropy: 0.35 }), rhythm: "Brief and specific. Names the line, the problem, and the fix." },
  { id: "code-comment", name: "Code Comment", dials: dials({ formality: 0.45, warmth: 0.2, directness: 0.95, sentenceLength: 11, sentenceRhythmVariance: 0.3, paragraphVariance: 0.2, contractionUse: 0.35, emDashUse: 0.05, fragmentTolerance: 0.6, questionUse: 0.05, entropy: 0.25 }), rhythm: "Minimal. Explains why, never restates what the code says." },
  { id: "slack-message", name: "Slack Message", dials: dials({ formality: 0.15, warmth: 0.7, directness: 0.8, sentenceLength: 10, sentenceRhythmVariance: 0.6, paragraphVariance: 0.4, contractionUse: 0.9, emDashUse: 0.35, fragmentTolerance: 0.85, questionUse: 0.35, entropy: 0.6 }), rhythm: "Fragments and quick hits. Reads like talking, not writing." },
  { id: "linkedin-post", name: "LinkedIn Post", dials: dials({ formality: 0.4, warmth: 0.65, directness: 0.7, sentenceLength: 12, sentenceRhythmVariance: 0.65, paragraphVariance: 0.8, contractionUse: 0.65, emDashUse: 0.4, fragmentTolerance: 0.7, questionUse: 0.3, entropy: 0.55 }), rhythm: "One short paragraph per beat. Line breaks do the pacing." },
  { id: "website-copy", name: "Website Copy", dials: dials({ formality: 0.45, warmth: 0.6, directness: 0.85, sentenceLength: 13, sentenceRhythmVariance: 0.5, paragraphVariance: 0.5, contractionUse: 0.6, emDashUse: 0.3, fragmentTolerance: 0.6, questionUse: 0.2, entropy: 0.45 }), rhythm: "Benefit-first and scannable. Every sentence earns its space." },
  { id: "blog-post", name: "Blog Post", dials: dials({ formality: 0.4, warmth: 0.6, directness: 0.6, sentenceLength: 18, sentenceRhythmVariance: 0.65, paragraphVariance: 0.65, contractionUse: 0.7, emDashUse: 0.5, fragmentTolerance: 0.5, questionUse: 0.3, entropy: 0.6 }), rhythm: "Conversational flow with varied paragraph lengths and the odd aside." },
];

/* ------------------------------------------------------------------ */
/* Tell vocabulary (original to this rebuild, from README examples)    */
/* ------------------------------------------------------------------ */

export const TELL_WORDS: Array<{ word: string; replacement: string }> = [
  { word: "comprehensive", replacement: "complete, or name what it actually covers" },
  { word: "cutting-edge", replacement: "new or recent — name the version or date" },
  { word: "leverage", replacement: "use" },
  { word: "seamless", replacement: "smooth, or describe what actually happens" },
  { word: "streamline", replacement: "simplify, or say which step was removed" },
  { word: "delve", replacement: "look at / dig into" },
  { word: "furthermore", replacement: "also — or just start the sentence" },
  { word: "moreover", replacement: "also" },
  { word: "additionally", replacement: "also" },
  { word: "in conclusion", replacement: "cut it; end on the point itself" },
  { word: "it's worth noting", replacement: "cut it and state the fact" },
  { word: "in today's fast-paced world", replacement: "cut it; start with the real subject" },
  { word: "ever-evolving", replacement: "changing" },
  { word: "landscape", replacement: "market / field — say which one" },
  { word: "tapestry", replacement: "mix" },
  { word: "testament to", replacement: "shows / proves" },
  { word: "underscore", replacement: "show / stress" },
  { word: "pivotal", replacement: "key, or say why it mattered" },
  { word: "robust", replacement: "sturdy, or give the failure rate" },
  { word: "elevate", replacement: "improve / raise" },
  { word: "unlock", replacement: "open / allow" },
  { word: "harness", replacement: "use" },
  { word: "foster", replacement: "build / encourage" },
  { word: "enhance", replacement: "improve" },
  { word: "utilize", replacement: "use" },
  { word: "facilitate", replacement: "help / run" },
  { word: "realm", replacement: "area / field" },
  { word: "embark on a journey", replacement: "start" },
  { word: "game-changer", replacement: "name the concrete change" },
  { word: "revolutionize", replacement: "change — say how" },
  { word: "synergy", replacement: "name the two things that combine" },
  { word: "holistic", replacement: "whole, or list the parts" },
  { word: "paradigm shift", replacement: "big change — describe it" },
  { word: "at the end of the day", replacement: "cut it" },
  { word: "delight", replacement: "say what users actually get" },
];

const ABSTRACT_WORDS = new Set([
  "quality", "excellence", "innovation", "solution", "solutions", "value",
  "growth", "success", "efficiency", "effectiveness", "strategy",
  "approach", "process", "experience", "journey", "vision", "mission",
  "impact", "engagement", "empowerment", "transformation", "potential",
]);

const CONCRETE_HINTS =
  /\b\d|[$€£%]|\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

/* ------------------------------------------------------------------ */
/* Text measurement                                                    */
/* ------------------------------------------------------------------ */

export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+["')\]]*|\S[^.!?]*$/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

export function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

const CONTRACTION_RE = /\b\w+['’](t|s|re|ve|ll|d|m)\b/gi;
const EM_DASH_RE = /—|--/g;

export function measureText(text: string): TextStats {
  const sentences = splitSentences(text);
  const paragraphs = splitParagraphs(text);
  const words = wordsOf(text);
  const sentLens = sentences.map((s) => wordsOf(s).length);
  const paraLens = paragraphs.map((p) => wordsOf(p).length);
  const per100 = words.length > 0 ? 100 / words.length : 0;
  return {
    wordCount: words.length,
    sentenceCount: sentences.length,
    paragraphCount: paragraphs.length,
    avgSentenceLength: sentLens.length
      ? sentLens.reduce((a, b) => a + b, 0) / sentLens.length
      : 0,
    sentenceLengthStdDev: stdDev(sentLens),
    paragraphLengthStdDev: stdDev(paraLens),
    contractionRate: (text.match(CONTRACTION_RE)?.length ?? 0) * per100,
    emDashRate: (text.match(EM_DASH_RE)?.length ?? 0) * per100,
    fragmentRate: sentLens.length
      ? sentLens.filter((n) => n < 5).length / sentLens.length
      : 0,
    questionRate: sentences.length
      ? sentences.filter((s) => s.endsWith("?")).length / sentences.length
      : 0,
  };
}

function dialsFromStats(stats: TextStats): VoiceDials {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  return {
    formality: clamp01(1 - stats.contractionRate / 6),
    warmth: 0.5,
    directness: 0.5,
    sentenceLength: Math.round(stats.avgSentenceLength * 10) / 10,
    sentenceRhythmVariance: clamp01(
      stats.avgSentenceLength > 0
        ? stats.sentenceLengthStdDev / stats.avgSentenceLength
        : 0,
    ),
    paragraphVariance: clamp01(
      stats.paragraphCount > 1 ? stats.paragraphLengthStdDev / 40 : 0.3,
    ),
    contractionUse: clamp01(stats.contractionRate / 5),
    emDashUse: clamp01(stats.emDashRate / 2),
    fragmentTolerance: clamp01(stats.fragmentRate),
    questionUse: clamp01(stats.questionRate),
    entropy: 0.5,
  };
}

function rhythmFromStats(stats: TextStats): string {
  const len = stats.avgSentenceLength;
  const size = len < 12 ? "Short" : len < 19 ? "Medium-length" : "Long";
  const varWord =
    stats.sentenceLengthStdDev < 3
      ? "evenly paced"
      : stats.sentenceLengthStdDev < 6
        ? "moderately varied"
        : "highly varied";
  return `${size} sentences (avg ${len.toFixed(1)} words), ${varWord} rhythm; ${stats.contractionRate.toFixed(1)} contractions and ${stats.emDashRate.toFixed(1)} em dashes per 100 words across ${stats.paragraphCount} paragraph(s).`;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export function resolveHome(explicit?: string): string {
  return explicit ?? process.env.TELLCHECK_HOME ?? join(homedir(), ".tellcheck");
}

function slugify(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "style";
}

export class TellcheckStore {
  readonly home: string;
  private data: StoreData;

  constructor(home?: string) {
    this.home = resolveHome(home);
    this.data = this.load();
  }

  private file(): string {
    return join(this.home, "state.json");
  }

  private load(): StoreData {
    try {
      if (existsSync(this.file())) {
        const parsed = JSON.parse(readFileSync(this.file(), "utf8")) as StoreData;
        if (parsed && Array.isArray(parsed.styles)) return parsed;
      }
    } catch {
      /* fall through to a fresh store */
    }
    return {
      styles: [],
      defaultStyleId: null,
      teamStyleId: null,
      globalBannedWords: [],
      globalCustomWords: [],
      globalInstructions: null,
    };
  }

  private save(): void {
    mkdirSync(this.home, { recursive: true });
    writeFileSync(this.file(), JSON.stringify(this.data, null, 2) + "\n", "utf8");
  }

  private presetRecords(): StyleRecord[] {
    return PRESETS.map((p) => ({
      id: p.id,
      name: p.name,
      kind: "preset" as const,
      dials: { ...p.dials },
      rhythm: p.rhythm,
      baseline: null,
      samples: [],
      bannedWords: [],
      customWords: [],
      instructions: null,
    }));
  }

  private allStyles(): StyleRecord[] {
    const out = this.presetRecords();
    for (const s of this.data.styles) {
      if (!out.some((p) => p.id === s.id)) out.push(s);
    }
    return out;
  }

  getStyle(styleId: string): StyleRecord {
    const found = this.allStyles().find(
      (s) => s.id === styleId || s.name.toLowerCase() === styleId.toLowerCase(),
    );
    if (!found) throw new Error(`Unknown style: ${styleId}`);
    return found;
  }

  private uniqueId(name: string): string {
    const base = slugify(name);
    let id = base;
    let n = 2;
    while (this.allStyles().some((s) => s.id === id)) id = `${base}-${n++}`;
    return id;
  }

  /* ------------------------------ tools --------------------------- */

  listStyles() {
    const styles = this.allStyles().map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      dials: s.dials,
      rhythm: s.rhythm,
    }));
    const team = this.data.teamStyleId
      ? styles.find((s) => s.id === this.data.teamStyleId) ?? null
      : null;
    return { styles, defaultStyleId: this.data.defaultStyleId, teamStyle: team };
  }

  getStyleGuide(styleId: string) {
    const s = this.getStyle(styleId);
    return {
      id: s.id,
      name: s.name,
      kind: s.kind,
      dials: s.dials,
      rhythm: s.rhythm,
      baseline: s.baseline,
      sampleCount: s.samples.length,
      instructions: s.instructions ?? this.data.globalInstructions,
      guide:
        `${s.name}: formality ${s.dials.formality}, warmth ${s.dials.warmth}, ` +
        `directness ${s.dials.directness}; target sentence length ` +
        `${s.dials.sentenceLength} words. Rhythm: ${s.rhythm}`,
    };
  }

  trainStyle(name: string, samples: string[]) {
    if (!samples || samples.length === 0)
      throw new Error("train_style needs at least one sample");
    const joined = samples.join("\n\n");
    const baseline = measureText(joined);
    const record: StyleRecord = {
      id: this.uniqueId(name),
      name,
      kind: "trained",
      dials: dialsFromStats(baseline),
      rhythm: rhythmFromStats(baseline),
      baseline,
      samples: [...samples],
      bannedWords: [],
      customWords: [],
      instructions: null,
    };
    this.data.styles.push(record);
    this.save();
    return { style: record, baseline };
  }

  createStyleFromDials(name: string, input: PartialDials) {
    const record: StyleRecord = {
      id: this.uniqueId(name),
      name,
      kind: "custom",
      dials: dials(input),
      rhythm: "Defined by dials; no samples measured yet.",
      baseline: null,
      samples: [],
      bannedWords: [],
      customWords: [],
      instructions: null,
    };
    this.data.styles.push(record);
    this.save();
    return { style: record };
  }

  updateStyle(styleId: string, name?: string, input?: PartialDials) {
    const preset = PRESETS.some((p) => p.id === styleId);
    if (preset)
      throw new Error(
        `Cannot update a shipped preset (${styleId}); fork it first, then update the fork`,
      );
    const record = this.data.styles.find((s) => s.id === styleId);
    if (!record) throw new Error(`Unknown style: ${styleId}`);
    if (name) record.name = name;
    if (input) record.dials = { ...record.dials, ...input };
    this.save();
    return { style: record };
  }

  forkStyle(source: string, name: string) {
    // Public-gallery handles/slugs (e.g. "@someone/style" or "gallery:slug")
    // cannot be resolved by this fully local rebuild — say so honestly.
    if (source.includes("/") || source.startsWith("gallery:") || source.startsWith("@")) {
      throw new Error(
        `Cannot fork "${source}" in this local rebuild: public-gallery forks ` +
          `need the hosted gallery, which is not available offline. Fork a ` +
          `local style id or preset name instead.`,
      );
    }
    const src = this.getStyle(source);
    const record: StyleRecord = {
      ...src,
      id: this.uniqueId(name),
      name,
      kind: src.kind === "preset" ? "custom" : src.kind,
      dials: { ...src.dials },
      samples: [...src.samples],
      bannedWords: [...src.bannedWords],
      customWords: [...src.customWords],
    };
    this.data.styles.push(record);
    this.save();
    return { style: record, forkedFrom: src.id };
  }

  deleteStyle(styleId: string) {
    if (PRESETS.some((p) => p.id === styleId))
      throw new Error(`Cannot delete a shipped preset (${styleId})`);
    const idx = this.data.styles.findIndex((s) => s.id === styleId);
    if (idx === -1) throw new Error(`Unknown style: ${styleId}`);
    const [removed] = this.data.styles.splice(idx, 1);
    if (this.data.defaultStyleId === styleId) this.data.defaultStyleId = null;
    if (this.data.teamStyleId === styleId) this.data.teamStyleId = null;
    this.save();
    return { id: removed.id, name: removed.name };
  }

  setDefaultStyle(styleId: string) {
    const s = this.getStyle(styleId);
    this.data.defaultStyleId = s.id;
    this.save();
    return { defaultStyleId: s.id };
  }

  checkVoiceMatch(text: string, styleId: string): VoiceMatchResult {
    const style = this.getStyle(styleId);
    const stats = measureText(text);
    const base = style.baseline;
    const expected = {
      avgSentenceLength: base ? base.avgSentenceLength : style.dials.sentenceLength,
      sentenceLengthStdDev: base
        ? base.sentenceLengthStdDev
        : style.dials.sentenceRhythmVariance * style.dials.sentenceLength,
      contractionRate: base ? base.contractionRate : style.dials.contractionUse * 5,
      emDashRate: base ? base.emDashRate : style.dials.emDashUse * 2,
      fragmentRate: base ? base.fragmentRate : style.dials.fragmentTolerance,
      questionRate: base ? base.questionRate : style.dials.questionUse,
    };
    const actual = {
      avgSentenceLength: stats.avgSentenceLength,
      sentenceLengthStdDev: stats.sentenceLengthStdDev,
      contractionRate: stats.contractionRate,
      emDashRate: stats.emDashRate,
      fragmentRate: stats.fragmentRate,
      questionRate: stats.questionRate,
    };
    const comparisons = (Object.keys(expected) as Array<keyof typeof expected>).map(
      (metric) => ({
        metric,
        expected: Math.round(expected[metric] * 100) / 100,
        actual: Math.round(actual[metric] * 100) / 100,
        delta: Math.round((actual[metric] - expected[metric]) * 100) / 100,
      }),
    );
    // Score: 100 minus the summed relative drift, floored at 0.
    let drift = 0;
    for (const c of comparisons) {
      const scale = Math.max(Math.abs(c.expected), 0.5);
      drift += Math.min(Math.abs(c.delta) / scale, 1);
    }
    const score = Math.max(0, Math.round(100 - (drift / comparisons.length) * 100));
    const findings: string[] = [];
    for (const c of comparisons) {
      const scale = Math.max(Math.abs(c.expected), 0.5);
      if (Math.abs(c.delta) / scale > 0.6)
        findings.push(
          `${c.metric}: expected about ${c.expected}, got ${c.actual}`,
        );
    }
    if (findings.length === 0)
      findings.push("Rhythm and mechanics sit close to the style baseline.");
    const low = stats.wordCount < 50 || stats.sentenceCount < 3;
    return {
      styleId: style.id,
      score,
      confidence: low ? "low" : "normal",
      note: low
        ? "Low confidence: fewer than 50 words or 3 sentences — rhythm estimates are noisy on short input."
        : null,
      comparisons,
      findings,
    };
  }

  checkSelfRepetition(text: string, styleId: string) {
    const style = this.getStyle(styleId);
    const sentences = splitSentences(text);
    const openerCounts = new Map<string, number>();
    for (const s of sentences) {
      const opener = wordsOf(s).slice(0, 3).join(" ");
      if (opener) openerCounts.set(opener, (openerCounts.get(opener) ?? 0) + 1);
    }
    const repeatedOpeners = [...openerCounts.entries()]
      .filter(([, n]) => n > 1)
      .map(([opener, count]) => ({ opener, count }));
    // Repeated 4-word phrases anywhere in the text.
    const words = wordsOf(text);
    const phraseCounts = new Map<string, number>();
    for (let i = 0; i + 4 <= words.length; i++) {
      const phrase = words.slice(i, i + 4).join(" ");
      phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
    }
    const repeatedPhrases = [...phraseCounts.entries()]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([phrase, count]) => ({ phrase, count }));
    // Overlap with training-sample openers.
    const sampleOpeners = new Set<string>();
    for (const sample of style.samples)
      for (const s of splitSentences(sample)) {
        const opener = wordsOf(s).slice(0, 3).join(" ");
        if (opener) sampleOpeners.add(opener);
      }
    const againstSamples = [...openerCounts.keys()].filter((o) => sampleOpeners.has(o));
    return {
      styleId: style.id,
      repeatedOpeners,
      repeatedPhrases,
      repeatedAgainstTrainingSamples: againstSamples,
      verdict:
        repeatedOpeners.length + repeatedPhrases.length === 0
          ? "No repeated openers or phrases found."
          : "Repetition found — see repeatedOpeners / repeatedPhrases.",
    };
  }

  auditText(text: string, register = "general", sourceFacts?: string[]): AuditResult {
    const valid = ["email", "blog", "memo", "essay", "social", "docs", "general", "personal"];
    const reg = valid.includes(register) ? register : "general";
    const stats = measureText(text);
    const findings: AuditFinding[] = [];
    const lower = text.toLowerCase();
    let penalty = 0;
    for (const { word, replacement } of TELL_WORDS) {
      let idx = lower.indexOf(word);
      while (idx !== -1) {
        findings.push({
          type: "tell_vocabulary",
          severity: "medium",
          message: `"${word}" is a common AI tell.`,
          location: { index: idx, excerpt: text.slice(Math.max(0, idx - 20), idx + word.length + 20) },
          replacement,
        });
        penalty += 6;
        idx = lower.indexOf(word, idx + word.length);
      }
    }
    // Banned words from the merged dictionary are hard findings too.
    // (Global scope: audit_text takes no style in the original spec.)
    for (const word of this.data.globalBannedWords) {
      const idx = lower.indexOf(word.toLowerCase());
      if (idx !== -1) {
        findings.push({
          type: "banned_word",
          severity: "high",
          message: `"${word}" is on the banned-word list.`,
          location: { index: idx, excerpt: text.slice(Math.max(0, idx - 20), idx + word.length + 20) },
        });
        penalty += 8;
      }
    }
    // Rhythm: uniform paragraph lengths.
    const paragraphs = splitParagraphs(text);
    if (paragraphs.length >= 3 && stats.paragraphLengthStdDev < 4) {
      findings.push({
        type: "uniform_paragraph_length",
        severity: "low",
        message: "Paragraph lengths are nearly uniform, a common machine rhythm.",
        location: null,
      });
      penalty += 8;
    }
    // Rhythm: low burstiness (sentence lengths barely vary).
    if (stats.sentenceCount >= 4 && stats.avgSentenceLength > 0) {
      const cv = stats.sentenceLengthStdDev / stats.avgSentenceLength;
      if (cv < 0.25) {
        findings.push({
          type: "low_burstiness",
          severity: "low",
          message: `Sentence lengths barely vary (variation ${cv.toFixed(2)}); human writing mixes short and long sentences.`,
          location: null,
        });
        penalty += 8;
      }
    }
    // Markdown structure — suppressed for the docs register.
    if (reg !== "docs" && /(^|\n)#{1,6}\s|\*\*[^*]+\*\*/.test(text)) {
      findings.push({
        type: "markdown_structure",
        severity: "info",
        message: "Markdown headings or bold markers in non-docs prose can read as generated structure.",
        location: null,
      });
      penalty += 3;
    }
    // Numbers not backed by the supplied source facts.
    if (sourceFacts && sourceFacts.length > 0) {
      const factText = sourceFacts.join(" ");
      const numbers = text.match(/\d[\d,.%]*/g) ?? [];
      for (const n of numbers) {
        if (!factText.includes(n)) {
          findings.push({
            type: "unverified_number",
            severity: "medium",
            message: `Number "${n}" does not appear in the supplied source facts.`,
            location: { index: text.indexOf(n), excerpt: n },
          });
          penalty += 5;
        }
      }
    }
    // Strengths: specificity and concrete-vs-abstract balance.
    const words = wordsOf(text);
    let concrete = 0;
    let abstract = 0;
    for (const w of words) {
      if (ABSTRACT_WORDS.has(w)) abstract++;
      if (CONCRETE_HINTS.test(w)) concrete++;
    }
    concrete += (text.match(/\d/g) ?? []).length;
    const strengths: string[] = [];
    if (concrete > 0)
      strengths.push(`Specificity: ${concrete} concrete anchor(s) (numbers, dates, amounts).`);
    const ratio = abstract === 0 ? concrete : Math.round((concrete / abstract) * 100) / 100;
    if (concrete >= abstract && concrete > 0)
      strengths.push(`Concrete language outweighs abstract language (${concrete}:${abstract}).`);
    if (strengths.length === 0)
      strengths.push("No strong specificity signals found — add a number, a name, or a date.");
    const score = Math.max(0, Math.min(100, 100 - penalty));
    const tier = score >= 85 ? "green" : score >= 65 ? "yellow" : score >= 45 ? "orange" : "red";
    return { tier, score, register: reg, findings, strengths, stats, concreteAbstract: { concrete, abstract, ratio } };
  }

  secondRead(_text: string): never {
    throw new Error(
      "second_read is not available in the local install: the original tool's " +
        "second read runs on a hosted model and the local package ships without " +
        "it, so this call always fails locally. Use audit_text and " +
        "check_voice_match for the local, deterministic checks.",
    );
  }

  /* ------------------------- dictionary --------------------------- */

  private wordList(styleId: string | undefined, kind: "bannedWords" | "customWords") {
    if (!styleId)
      return kind === "bannedWords" ? this.data.globalBannedWords : this.data.globalCustomWords;
    const style = this.getStyle(styleId);
    if (style.kind === "preset")
      throw new Error(`Cannot edit the dictionary of a shipped preset (${style.id}); fork it first`);
    return style[kind];
  }

  private storedStyle(styleId: string): StyleRecord {
    const record = this.data.styles.find((s) => s.id === styleId);
    if (!record) throw new Error(`Unknown style: ${styleId}`);
    return record;
  }

  addWord(kind: "banned" | "custom", word: string, styleId?: string) {
    const w = word.trim();
    if (!w) throw new Error("word must not be empty");
    if (styleId) {
      const record = this.storedStyle(this.getStyle(styleId).id);
      const list = kind === "banned" ? record.bannedWords : record.customWords;
      if (!list.some((x) => x.toLowerCase() === w.toLowerCase())) list.push(w);
    } else {
      const list = kind === "banned" ? this.data.globalBannedWords : this.data.globalCustomWords;
      if (!list.some((x) => x.toLowerCase() === w.toLowerCase())) list.push(w);
    }
    this.save();
    return this.listDictionary(styleId);
  }

  removeWord(kind: "banned" | "custom", word: string, styleId?: string) {
    const w = word.trim().toLowerCase();
    const filter = (list: string[]) => list.filter((x) => x.toLowerCase() !== w);
    if (styleId) {
      const record = this.storedStyle(this.getStyle(styleId).id);
      if (kind === "banned") record.bannedWords = filter(record.bannedWords);
      else record.customWords = filter(record.customWords);
    } else if (kind === "banned") {
      this.data.globalBannedWords = filter(this.data.globalBannedWords);
    } else {
      this.data.globalCustomWords = filter(this.data.globalCustomWords);
    }
    this.save();
    return this.listDictionary(styleId);
  }

  listDictionary(styleId?: string) {
    const result: Record<string, unknown> = {
      global: {
        bannedWords: [...this.data.globalBannedWords],
        customWords: [...this.data.globalCustomWords],
      },
    };
    if (styleId) {
      const style = this.getStyle(styleId);
      const merge = (a: string[], b: string[]) => {
        const out = [...a];
        for (const w of b) if (!out.some((x) => x.toLowerCase() === w.toLowerCase())) out.push(w);
        return out;
      };
      result.style = {
        styleId: style.id,
        bannedWords: [...style.bannedWords],
        customWords: [...style.customWords],
      };
      result.effective = {
        styleId: style.id,
        bannedWords: merge(this.data.globalBannedWords, style.bannedWords),
        customWords: merge(this.data.globalCustomWords, style.customWords),
      };
    }
    return result;
  }

  /* ------------------------- instructions -------------------------- */

  setInstructions(instructions: string, styleId?: string) {
    if (styleId) {
      const record = this.storedStyle(this.getStyle(styleId).id);
      record.instructions = instructions;
    } else {
      this.data.globalInstructions = instructions;
    }
    this.save();
    return this.getInstructions(styleId);
  }

  clearInstructions(styleId?: string) {
    if (styleId) {
      const record = this.storedStyle(this.getStyle(styleId).id);
      record.instructions = null;
    } else {
      this.data.globalInstructions = null;
    }
    this.save();
    return this.getInstructions(styleId);
  }

  getInstructions(styleId?: string) {
    if (!styleId)
      return { scope: "global", instructions: this.data.globalInstructions };
    const style = this.getStyle(styleId);
    return {
      scope: "style",
      styleId: style.id,
      instructions: style.instructions,
      globalInstructions: this.data.globalInstructions,
      effective: style.instructions ?? this.data.globalInstructions,
    };
  }
}

/** Dispatch one tool call by name. Used by both the MCP server and CLI. */
export function callTellcheckTool(
  store: TellcheckStore,
  name: string,
  args: Record<string, unknown>,
): unknown {
  const str = (key: string): string => {
    const v = args[key];
    if (typeof v !== "string" || v.length === 0)
      throw new Error(`Missing or invalid string argument: ${key}`);
    return v;
  };
  const optStr = (key: string): string | undefined =>
    typeof args[key] === "string" ? (args[key] as string) : undefined;
  switch (name) {
    case "list_styles":
      return store.listStyles();
    case "get_style_guide":
      return store.getStyleGuide(str("styleId"));
    case "train_style": {
      const samples = args.samples;
      if (!Array.isArray(samples) || samples.some((s) => typeof s !== "string"))
        throw new Error("samples must be an array of strings");
      return store.trainStyle(str("name"), samples as string[]);
    }
    case "create_style_from_dials": {
      const d = args.dials;
      if (!d || typeof d !== "object" || Array.isArray(d))
        throw new Error("dials must be an object");
      return store.createStyleFromDials(str("name"), d as PartialDials);
    }
    case "update_style": {
      const d = args.dials as PartialDials | undefined;
      return store.updateStyle(str("styleId"), optStr("name"), d);
    }
    case "fork_style":
      return store.forkStyle(str("source"), str("name"));
    case "delete_style":
      return store.deleteStyle(str("styleId"));
    case "set_default_style":
      return store.setDefaultStyle(str("styleId"));
    case "check_voice_match":
      return store.checkVoiceMatch(str("text"), str("styleId"));
    case "check_self_repetition":
      return store.checkSelfRepetition(str("text"), str("styleId"));
    case "audit_text": {
      const facts = args.sourceFacts;
      if (facts !== undefined && (!Array.isArray(facts) || facts.some((s) => typeof s !== "string")))
        throw new Error("sourceFacts must be an array of strings");
      return store.auditText(str("text"), optStr("register") ?? "general", facts as string[] | undefined);
    }
    case "second_read":
      return store.secondRead(str("text"));
    case "add_banned_word":
      return store.addWord("banned", str("word"), optStr("styleId"));
    case "remove_banned_word":
      return store.removeWord("banned", str("word"), optStr("styleId"));
    case "add_custom_word":
      return store.addWord("custom", str("word"), optStr("styleId"));
    case "remove_custom_word":
      return store.removeWord("custom", str("word"), optStr("styleId"));
    case "list_dictionary":
      return store.listDictionary(optStr("styleId"));
    case "set_style_instructions":
      return store.setInstructions(str("instructions"), optStr("styleId"));
    case "clear_style_instructions":
      return store.clearInstructions(optStr("styleId"));
    case "get_style_instructions":
      return store.getInstructions(optStr("styleId"));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export const TOOL_NAMES = [
  "list_styles", "get_style_guide", "train_style", "create_style_from_dials",
  "update_style", "fork_style", "delete_style", "set_default_style",
  "check_voice_match", "check_self_repetition", "audit_text", "second_read",
  "add_banned_word", "remove_banned_word", "add_custom_word",
  "remove_custom_word", "list_dictionary", "set_style_instructions",
  "clear_style_instructions", "get_style_instructions",
] as const;
