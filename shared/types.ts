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
}
export interface AIReport {
  id: string;
  storyId: string;
  version: number;
  kind: "research" | "draft";
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
  state: "reserved" | "succeeded" | "held" | "uncertain" | "blocked";
  createdAt: string;
  usage?: Record<string, unknown>;
  providerId?: string;
  note?: string;
}
export interface PilotStatus {
  enabled: boolean;
  limitUsd: number;
  reservedUsd: number;
  remainingUsd: number;
  events: CostEvent[];
  providers: { claude: boolean; gemini: boolean; assemblyai: boolean };
  models: { claude: string; gemini: string };
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
}
