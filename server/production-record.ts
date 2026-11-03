import {
  PRODUCTION_STANDARD,
  type ProductionRecord,
  type SourceCard,
} from "../shared/production.js";
import type { Story, Render, RenderedShot } from "../shared/types.js";
import { editorialAssertions, editorialIssues } from "./editorial-check.js";
import { visualPlanIssues } from "./visual-plan.js";

export function usedReportingSources(story: Story, segmentId?: string) {
  const claimIds = new Set(
    story.segments
      .filter((s) => segmentId === undefined || s.id === segmentId)
      .flatMap((s) => s.claimIds)
      .concat(
        segmentId === undefined
          ? editorialAssertions(story).flatMap((a) => a.claimIds)
          : [],
      ),
  );
  const sourceIds = new Set(
    story.claims
      .filter((c) => claimIds.has(c.id))
      .flatMap((c) =>
        c.evidence
          .filter((e) => e.relation === "supports")
          .map((e) => e.sourceId),
      ),
  );
  return story.sources.filter((s) => sourceIds.has(s.id));
}

export function usedVisualAssets(story: Story, shots?: RenderedShot[]) {
  const currentShots =
    shots ??
    story.renders.find((r) => r.version === story.version)?.shots ??
    [];
  const ids = new Set([
    ...story.segments.flatMap((s) => (s.assetId ? [s.assetId] : [])),
    ...currentShots.flatMap((s) => (s.assetId ? [s.assetId] : [])),
  ]);
  return story.assets.filter((a) => ids.has(a.id));
}

export function sourcePageUrl(story: Story) {
  const base = new URL(process.env.PUBLIC_BASE_URL || "http://localhost:4310");
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password
  )
    throw new Error(
      "PUBLIC_BASE_URL must be an HTTP(S) address without credentials.",
    );
  return new URL(`/s/${story.id.slice(0, 8)}?v=${story.version}`, base.origin)
    .href;
}

export function assertNarrationDuration(seconds: number) {
  const s = PRODUCTION_STANDARD;
  if (
    !Number.isFinite(seconds) ||
    seconds < s.minNarrationSeconds ||
    seconds > s.maxNarrationSeconds
  )
    throw new Error(
      `Narration is ${seconds.toFixed(1)} seconds. Require ${s.minNarrationSeconds}–${s.maxNarrationSeconds} seconds of substantive speech, excluding source credits. Add supported context or hold the story; do not pad or slow the audio.`,
    );
}

export function assertNarrationScript(story: Story) {
  const issues = editorialIssues(story);
  if (issues.length) throw new Error(issues[0]);
  const words = story.segments
    .map((s) => s.text)
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (
    words < PRODUCTION_STANDARD.minWords ||
    words > PRODUCTION_STANDARD.maxWords
  )
    throw new Error(
      `Narration has ${words} words; require ${PRODUCTION_STANDARD.minWords}–${PRODUCTION_STANDARD.maxWords} words for a substantive minute-long story. Add supported context or hold the story.`,
    );
}

export function productionRecord(
  story: Story,
  narrationDuration: number,
  storyDuration: number,
  shots?: RenderedShot[],
): ProductionRecord {
  assertNarrationScript(story);
  assertNarrationDuration(narrationDuration);
  if (
    !Number.isFinite(storyDuration) ||
    storyDuration < narrationDuration ||
    storyDuration - narrationDuration > 1
  )
    throw new Error("Story timing does not match measured narration.");
  const sourceIds = usedReportingSources(story).map((s) => s.id);
  if (!sourceIds.length)
    throw new Error("Closing sources require supporting reporting records.");
  const sourceCards: SourceCard[] = [];
  for (
    let i = 0;
    i < sourceIds.length;
    i += PRODUCTION_STANDARD.sourcesPerCard
  ) {
    const start =
      storyDuration +
      sourceCards.length * PRODUCTION_STANDARD.sourceCardSeconds;
    sourceCards.push({
      id: `sources-${String(sourceCards.length + 1).padStart(2, "0")}`,
      sourceIds: sourceIds.slice(i, i + PRODUCTION_STANDARD.sourcesPerCard),
      start,
      end: start + PRODUCTION_STANDARD.sourceCardSeconds,
    });
  }
  if (sourceCards.at(-1)!.end > PRODUCTION_STANDARD.maxVideoSeconds)
    throw new Error(
      "Story and complete closing sources exceed the 120-second production limit. Shorten the story without omitting citations.",
    );
  return {
    standard: PRODUCTION_STANDARD.version,
    narrationDuration,
    storyDuration,
    sourcePage: sourcePageUrl(story),
    sourceIds,
    assetIds: usedVisualAssets(story, shots).map((a) => a.id),
    sourceCards,
  };
}

// Persisted legacy exports remain viewable, but cannot satisfy a new release contract.
export function productionIssues(
  story: Story,
  render: Pick<Render, "duration" | "production" | "shots">,
): string[] {
  const p = render.production;
  if (!p || p.standard !== PRODUCTION_STANDARD.version)
    return [
      "Create a new render with at least 60 seconds of narration and complete closing sources. This export uses an earlier production standard.",
    ];
  try {
    const visualIssues = visualPlanIssues(story, render.shots || []);
    if (visualIssues.length) return visualIssues;
    const expected = productionRecord(
      story,
      p.narrationDuration,
      p.storyDuration,
      render.shots,
    );
    const same = (a: unknown, b: unknown) =>
      JSON.stringify(a) === JSON.stringify(b);
    if (
      !same(p.sourceIds, expected.sourceIds) ||
      !same(p.sourceCards, expected.sourceCards)
    )
      return [
        "Closing source cards must cover every used reporting source after the complete narration.",
      ];
    if (!same(p.assetIds, expected.assetIds))
      return [
        "The production record must credit every selected and timeline visual.",
      ];
    if (p.sourcePage !== expected.sourcePage)
      return [
        "The rendered source address does not match this revision and public origin. Create a new render.",
      ];
    if (
      !Number.isFinite(render.duration) ||
      Math.abs(render.duration - expected.sourceCards.at(-1)!.end) > 0.15
    )
      return [
        "Final video timing does not include the complete closing source sequence.",
      ];
    return [];
  } catch (error) {
    return [
      error instanceof Error ? error.message : "Invalid production record.",
    ];
  }
}
