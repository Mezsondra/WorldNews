export type ClaimStatus =
  | "supported fact"
  | "attributed statement"
  | "attributed reporting"
  | "allegation"
  | "analysis"
  | "disputed"
  | "insufficient evidence";
export type Stage =
  | "discovered"
  | "researching"
  | "drafting"
  | "producing"
  | "awaiting-review"
  | "approved"
  | "held"
  | "rejected";
export interface Source {
  origin?: {
    kind: "original" | "derived" | "unknown";
    key: string;
    parentSourceIds: string[];
    explanation: string;
  };
  id: string;
  url: string;
  title: string;
  publisher: string;
  author: string;
  publishedAt: string;
  retrievedAt: string;
  hash: string;
  text: string;
  language: string;
  lineage: string;
  kind: "primary" | "secondary";
  usage: string;
  research?: { runId: string; assessment: string; metadataReviewed?: boolean };
}
export interface Evidence {
  sourceId: string;
  passage: string;
  relation: "supports" | "contradicts";
  translation?: string;
}
export interface Claim {
  id: string;
  text: string;
  status: ClaimStatus;
  reviewed: boolean;
  evidence: Evidence[];
}
export interface Segment {
  beat?:
    | "development"
    | "mechanism"
    | "context"
    | "significance"
    | "response"
    | "uncertainty";
  id: string;
  text: string;
  claimIds: string[];
  assetId?: string;
  visualSelection?: "manual" | "automatic";
}
export interface Asset {
  graphic?: boolean;
  graphicNarration?: string[];
  contentHash?: string;
  rights?: import("./media-rights.js").MediaRights;
  id: string;
  file: string;
  mediaType?: "image" | "video";
  poster?: string;
  subject?: string;
  creator: string;
  permission: string;
  provenance: string;
  eventDate: string;
  location: string;
  archive: boolean;
  context: string;
  sourceMedia?: {
    sourceId: string;
    title: string;
    publisher: string;
    credit: string;
    downloadUrl: string;
    retrievedAt: string;
    hash: string;
    publishedAt: string;
    captureDate?: string;
    duration?: number;
    people?: boolean;
    reviewed: boolean;
    changes: string;
  };
  discovery?: {
    provider: "wikimedia";
    pageId: number;
    title: string;
    sourceUrl: string;
    licenseUrl: string;
    downloadUrl: string;
    hash: string;
    retrievedAt: string;
    changes: string;
    reviewed: boolean;
  };
}
export interface Render {
  quality?: import("./quality.js").QualityReport;
  productionProfile?: import("./visuals.js").ProductionProfile;
  visualPlan?: import("./visuals.js").EvidenceVisual[];
  visualCoverage?: import("./visuals.js").VisualCoverage;
  production?: import("./production.js").ProductionRecord;
  shots?: RenderedShot[];
  narrationReused?: number;
  shotsReused?: number;
  renderer?: "classic" | "moneyprinterturbo";
  rendererVersion?: string;
  version: number;
  card: string;
  story: string;
  video: string;
  captions: string;
  manifest: string;
  duration: number;
  createdAt: string;
  voice: string;
  captionTiming?: string;
  captionWarnings?: string[];
  privatePreview?: boolean;
  warnings?: string[];
}
export interface ShotOverride {
  id: string;
  segmentId: string;
  kind:
    | "media"
    | "fact"
    | "sources"
    | "map"
    | "document"
    | "timeline"
    | "chart"
    | "process"
    | "quote";
  visualId?: string;
  assetId?: string;
  framing: "contain" | "portrait" | "detail";
  videoStart?: number;
}
export interface RenderedShot extends ShotOverride {
  visual?: import("./visuals.js").EvidenceVisual;
  narration?: string;
  purpose?: string;
  start: number;
  end: number;
  label: string;
  credit: string;
  reused?: boolean;
  poster?: string;
}
export interface AIReport {
  id: string;
  storyId: string;
  version: number;
  kind: "research" | "draft" | "verification" | "visuals" | "construction";
  createdAt: string;
  data: Record<string, unknown>;
}
export interface CostEvent {
  id: string;
  operationKey: string;
  storyId: string;
  provider: string;
  operation: string;
  reservedUsd: number;
  state:
    "reserved" | "succeeded" | "held" | "uncertain" | "blocked" | "released";
  createdAt: string;
  usage?: Record<string, unknown>;
  providerId?: string;
  note?: string;
  researchRunId?: string;
  actualUsd?: number;
}
export interface PilotStatus {
  geminiVoice?: string;
  enabled: boolean;
  limitUsd: number;
  reservedUsd: number;
  remainingUsd: number;
  events: CostEvent[];
  providers: { claude: boolean; gemini: boolean; assemblyai: boolean };
  models: { claude: string; gemini: string; verification?: string };
  captions: string;
}
export interface Approval {
  version: number;
  destinations: string[];
  editor: string;
  at: string;
}
export interface Story {
  editorial?: {
    headline: { text: string; claimIds: string[] };
    summary: { text: string; claimIds: string[] };
    publishing: { text: string; claimIds: string[] };
    onScreen: { id: string; text: string; claimIds: string[] }[];
    check?: {
      standard: string;
      fingerprint: string;
      reportId: string;
      checkedAt: string;
      assertions: {
        id: string;
        verdict: "supported" | "unsupported" | "contradicted" | "uncertain";
        reason: string;
        sourceIds: string[];
      }[];
    };
  };
  shotOverrides?: ShotOverride[];
  captionProvider?: "estimated" | "assemblyai";
  narrationProvider?: "local" | "gemini";
  videoRenderer?: "classic" | "moneyprinterturbo";
  id: string;
  revision?: number;
  title: string;
  summary: string;
  category: string;
  region: string;
  eventAt: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  stage: Stage;
  demo: boolean;
  pilot?: boolean;
  sources: Source[];
  claims: Claim[];
  segments: Segment[];
  assets: Asset[];
  renders: Render[];
  approval?: Approval;
  corrections: { at: string; text: string; version: number }[];
  pronunciations: Record<string, string>;
  format?: "brief" | "explainer";
  automation?: {
    method?: "extractive" | "evidence-backed";
    previewCaptions?: { version: number; provider: "estimated" | "assemblyai" };
    previewNarration?: { version: number; provider: "local" | "gemini" };
    enabled: boolean;
    state: "waiting-research" | "queued" | "rendering" | "ready" | "blocked";
    message: string;
    warnings: string[];
  };
}
export interface Job {
  captions?: "estimated" | "assemblyai";
  tts?: "local" | "gemini";
  id: string;
  storyId: string;
  version: number;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: string;
  attempts: number;
  lease: number;
  error?: string;
  createdAt: string;
  kind?: "prepare" | "render" | "media" | "construct";
  privatePreview?: boolean;
}
export interface ResearchRun {
  id: string;
  storyId: string;
  version: number;
  revision: number;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: string;
  createdAt: string;
  lease: number;
  queries: string[];
  candidates: {
    url: string;
    title: string;
    status: "found" | "retrieved" | "skipped" | "failed";
    note?: string;
  }[];
  warnings: string[];
  error?: string;
  resultVersion?: number;
  mode?: "search" | "verify-saved";
  seedRunId?: string;
  verificationProvider?: "claude" | "gemini";
}
export interface Settings {
  paused: boolean;
}
export interface Gate {
  code: string;
  message: string;
}
export interface Overview {
  renderers?: { moneyprinterturbo: { available: boolean; detail: string } };
  stories: Story[];
  jobs: Job[];
  settings: Settings;
  storage: string;
  voice: string;
  publishing: string;
  gates: Record<string, Gate[]>;
  pilot?: PilotStatus;
  researchRuns?: ResearchRun[];
}
export interface Feed {
  url: string;
  name: string;
  addedAt: string;
  lastPolledAt?: string;
  error?: string;
  itemCount?: number;
}
export interface FeedItem {
  id: string;
  url: string;
  title: string;
  summary: string;
  publishedAt: string;
  seenAt: string;
  feed: string;
}
export interface Lead {
  id: string;
  title: string;
  items: FeedItem[];
  feeds: number;
  latestAt: string;
  warnings: string[];
  story?: { id: string; title: string; newItems: number };
}
export interface Discovery {
  feeds: Feed[];
  leads: Lead[];
  pollMinutes: number;
}
