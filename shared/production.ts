// A story's minimum is measured speech; closing references never count toward it.
export const PRODUCTION_STANDARD = {
  version: "worldnews-2026-11-02-v1",
  minWords: 140,
  maxWords: 205,
  minNarrationSeconds: 60,
  maxNarrationSeconds: 90,
  maxVideoSeconds: 120,
  sourcesPerCard: 3,
  sourceCardSeconds: 8,
} as const;

export interface SourceCard {
  id: string;
  sourceIds: string[];
  start: number;
  end: number;
}

export interface ProductionRecord {
  standard: string;
  narrationDuration: number;
  storyDuration: number;
  sourcePage: string;
  sourceIds: string[];
  assetIds: string[];
  sourceCards: SourceCard[];
}
