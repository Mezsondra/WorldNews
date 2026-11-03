export const VISUAL_STANDARD = "evidence-visuals-2026-11-02-v1";
export const CAPTION_STYLE = {
  version: "portrait-captions-2026-11-02-v1",
  font: "DejaVu Sans",
  size: 58,
  outline: 3,
  marginBottom: 510,
  maxLines: 2,
  width: 1080,
  height: 1920,
} as const;
export interface ProductionProfile {
  standard: string;
  renderer: "classic" | "moneyprinterturbo";
  rendererVersion: string;
  narrationProvider: string;
  voice: string;
  captionProvider: string;
  audioBitrateKbps?: number;
  captionStyle: typeof CAPTION_STYLE;
}

export interface VisualEvidence {
  claimId: string;
  sourceId: string;
  passage: string;
  // A saved translation is labelled separately from original source wording.
  translation?: string;
}
interface BeatVisual {
  id: string;
  segmentId: string;
  narration: string;
  purpose: string;
  evidence: VisualEvidence[];
}
export interface DocumentVisual extends BeatVisual {
  kind: "document";
  excerpt: string;
  translated: boolean;
}
export interface MapVisual extends BeatVisual {
  kind: "map";
  places: {
    id: string;
    name: string;
    mention: string;
    lon: number;
    lat: number;
  }[];
  geographyVersion: string;
}
export interface TimelineVisual extends BeatVisual {
  kind: "timeline";
  items: {
    date: string;
    order: number;
    excerpt: string;
    evidence: VisualEvidence;
  }[];
}
export interface ChartVisual extends BeatVisual {
  kind: "chart";
  unit: string;
  context: string;
  items: { label: string; value: number; displayedValue: string }[];
}
export interface ProcessVisual extends BeatVisual {
  kind: "process";
  steps: string[];
  translated: boolean;
}
export interface QuoteVisual extends BeatVisual {
  kind: "quote";
  quote: string;
  speaker: string;
  context: string;
  translated: boolean;
}
export type EvidenceVisual =
  | DocumentVisual
  | MapVisual
  | TimelineVisual
  | ChartVisual
  | ProcessVisual
  | QuoteVisual;
export type VisualDraft = EvidenceVisual extends infer V
  ? V extends EvidenceVisual
    ? Omit<V, "id">
    : never
  : never;
export const visualLabel = (kind: string) =>
  ({
    map: "Country locator",
    timeline: "Dated context",
    document: "Evidence excerpt",
    chart: "Reported comparison",
    process: "Source-described sequence",
    quote: "Attributed quotation",
    media: "Source media",
    fact: "Report graphic",
    sources: "Source record",
  })[kind] || kind;
export const visualReadingSeconds = (kind: string) =>
  ["chart", "process", "timeline"].includes(kind) ? 6 : 3;
export interface VisualCoverage {
  standard: string;
  narrationSeconds: number;
  purposefulSeconds: number;
  fullTextSeconds: number;
  percent: number;
  warnings: string[];
}
