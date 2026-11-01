export type ClaimStatus =
  | "supported fact"
  | "attributed statement"
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
  id: string;
  text: string;
  claimIds: string[];
  assetId?: string;
}
export interface Asset {
  id: string;
  file: string;
  creator: string;
  permission: string;
  provenance: string;
  eventDate: string;
  location: string;
  archive: boolean;
  context: string;
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
export interface AIReport {
  id: string;
  storyId: string;
  version: number;
  kind: "research" | "draft" | "verification" | "visuals";
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
}
export interface PilotStatus {
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
    enabled: boolean;
    state: "waiting-research" | "queued" | "rendering" | "ready" | "blocked";
    message: string;
    warnings: string[];
  };
}
export interface Job {
  id: string;
  storyId: string;
  version: number;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: string;
  attempts: number;
  lease: number;
  error?: string;
  createdAt: string;
  kind?: "prepare" | "render" | "media";
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
