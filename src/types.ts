/**
 * tellcheck types.
 *
 * A style is described by eleven dials (0..1, except sentenceLength which
 * is a target average in words), a rhythm description, and — for trained
 * styles — a measured baseline taken from the training samples.
 */

export interface VoiceDials {
  formality: number;
  warmth: number;
  directness: number;
  /** Target average sentence length, in words. */
  sentenceLength: number;
  sentenceRhythmVariance: number;
  paragraphVariance: number;
  contractionUse: number;
  emDashUse: number;
  fragmentTolerance: number;
  questionUse: number;
  entropy: number;
}

export type PartialDials = Partial<VoiceDials>;

export type StyleKind = "preset" | "trained" | "custom" | "team";

export interface TextStats {
  wordCount: number;
  sentenceCount: number;
  paragraphCount: number;
  avgSentenceLength: number;
  sentenceLengthStdDev: number;
  paragraphLengthStdDev: number;
  /** Contractions per 100 words. */
  contractionRate: number;
  /** Em dashes per 100 words. */
  emDashRate: number;
  /** Share of sentences shorter than five words. */
  fragmentRate: number;
  /** Share of sentences ending in a question mark. */
  questionRate: number;
}

export interface StyleRecord {
  id: string;
  name: string;
  kind: StyleKind;
  dials: VoiceDials;
  rhythm: string;
  baseline: TextStats | null;
  samples: string[];
  bannedWords: string[];
  customWords: string[];
  instructions: string | null;
}

export interface StoreData {
  styles: StyleRecord[];
  defaultStyleId: string | null;
  teamStyleId: string | null;
  globalBannedWords: string[];
  globalCustomWords: string[];
  globalInstructions: string | null;
}

export interface AuditFinding {
  type: string;
  severity: "info" | "low" | "medium" | "high";
  message: string;
  location: { index: number; excerpt: string } | null;
  replacement?: string;
}

export interface AuditResult {
  tier: "green" | "yellow" | "orange" | "red";
  score: number;
  register: string;
  findings: AuditFinding[];
  strengths: string[];
  stats: TextStats;
  concreteAbstract: { concrete: number; abstract: number; ratio: number };
}

export interface VoiceMatchResult {
  styleId: string;
  score: number;
  confidence: "low" | "normal";
  note: string | null;
  comparisons: Array<{
    metric: string;
    expected: number;
    actual: number;
    delta: number;
  }>;
  findings: string[];
}
