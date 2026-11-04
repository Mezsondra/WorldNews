import type { CostEvent } from "../shared/types.js";

export const CLAUDE_MODEL = "claude-sonnet-4-6";
export const GEMINI_MODEL = "gemini-3.8-flash-tts";
export const GEMINI_VERIFICATION_MODEL = "gemini-3.8-flash";

// USD per 1M tokens, standard paid tier. Checked 1 November 2026 against
// platform.claude.com pricing, ai.google.dev/gemini-api/docs/pricing and
// assemblyai.com/pricing. Recheck when a model or provider changes.
const claude: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
};
const WEB_SEARCH = 0.01; // US$10 per 1,000 searches
const gemini = (model: string, at: string) => {
  const factor = at >= "2027-01-01" ? 2 : 1; // Google's announced 2027 doubling
  const rates: Record<string, { input: number; output: number }> = {
    "gemini-3.8-flash": { input: 0.75, output: 3.75 },
    "gemini-3.8-flash-tts": { input: 0.5, output: 9 },
  };
  const r = rates[model];
  return r && { input: r.input * factor, output: r.output * factor };
};
const ASSEMBLYAI_PER_SECOND = 0.15 / 3600; // Universal-2

const n = (v: unknown) => (typeof v === "number" && v > 0 ? v : 0);

// Returns undefined when usage is missing or unrecognised; the reservation is then kept.
export function actualUsd(event: CostEvent): number | undefined {
  const usage = event.usage;
  if (!usage) return;
  if (event.provider === "assemblyai")
    return usage.audioSeconds
      ? n(usage.audioSeconds) * ASSEMBLYAI_PER_SECOND
      : undefined;
  let parts: unknown[];
  if (Array.isArray(usage.constructionCalls)) {
    if (
      !usage.constructionCalls.length ||
      usage.constructionCalls.length !== n(usage.completedCalls)
    )
      return;
    parts = usage.constructionCalls.map((call: any) => call?.usage);
  } else if (Array.isArray(usage.requests)) {
    // Narration records one entry per scene; an incomplete record cannot be priced.
    if (usage.requests.length !== n(usage.scenes)) return;
    parts = usage.requests.map((r: any) => r?.usage);
  } else if ("discovery" in usage || "verification" in usage)
    // Research runs one discovery call then one verification call; both must be recorded.
    parts =
      event.operation === "web-research"
        ? [usage.discovery, usage.verification]
        : [usage.verification];
  else parts = [usage];
  if (!parts.length) return;
  let total = 0;
  for (const part of parts as any[]) {
    if (!part || typeof part !== "object") return;
    if ("input_tokens" in part && "output_tokens" in part) {
      const rate = claude[CLAUDE_MODEL];
      if (!rate) return;
      const write1h = n(part.cache_creation?.ephemeral_1h_input_tokens);
      total +=
        (n(part.input_tokens) * rate.input +
          (n(part.cache_creation_input_tokens) - write1h) * rate.input * 1.25 +
          write1h * rate.input * 2 +
          n(part.cache_read_input_tokens) * rate.input * 0.1 +
          n(part.output_tokens) * rate.output) /
          1e6 +
        n(part.server_tool_use?.web_search_requests) * WEB_SEARCH;
    } else if ("total_input_tokens" in part) {
      const rate = gemini(
        event.operation === "narration"
          ? GEMINI_MODEL
          : GEMINI_VERIFICATION_MODEL,
        event.createdAt,
      );
      if (!rate) return;
      total +=
        ((n(part.total_input_tokens) + n(part.total_tool_use_tokens)) *
          rate.input +
          (n(part.total_output_tokens) + n(part.total_thought_tokens)) *
            rate.output) /
        1e6;
    } else return;
  }
  return total;
}
