export const QUALITY_STANDARD = {
  version: "private-quality-2026-11-03-v1",
  minVisualCoverage: 90,
  maxCaptionCps: 22,
  minCaptionSeconds: 0.65,
  maxCaptionSeconds: 6,
  captionWidth: 936,
  minLufs: -19,
  maxLufs: -13,
  maxTruePeak: -1,
  normalizationLufs: -16,
  normalizationTruePeak: -3.5,
  audioBitrateKbps: 192,
  silenceSeconds: 1.5,
  maxLocalRepairs: 1,
} as const;

export interface QualityFinding {
  code: string;
  severity: "hold" | "warning";
  message: string;
  shotId?: string;
  at?: number;
}
export interface QualityReport {
  standard: string;
  fingerprint: string;
  checkedAt: string;
  status: "passed" | "held";
  findings: QualityFinding[];
  repairs: { kind: "captions" | "audio" | "visuals"; message: string }[];
  measurements: {
    narrationSeconds: number;
    visualCoverage: number;
    captionCues: number;
    maxCaptionCps: number;
    lufs?: number;
    truePeak?: number;
    decoded: boolean;
    videoHash?: string;
    audioHash?: string;
  };
}
