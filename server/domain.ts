import type { Story, Gate, Source, Segment } from "../shared/types.js";
import { PRODUCTION_STANDARD } from "../shared/production.js";
import { productionIssues } from "./production-record.js";
import { independentOrigins, originGraphIssues } from "./source-origins.js";
import { editorialAssertions, editorialIssues } from "./editorial-check.js";
import { mediaRightsIssues } from "./media-rights.js";
import { qualityReleaseIssues } from "./video-quality.js";
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export const NARRATION_LIMITS = {
  min: PRODUCTION_STANDARD.minWords,
  max: PRODUCTION_STANDARD.maxWords,
};
// Legacy brief records remain readable; all newly prepared drafts use the minute-long format.
export const narrationFormat = (_words: number): "explainer" => "explainer";
export function newStory(title: string): Story {
  return {
    id: id(),
    title,
    summary: "",
    category: "World",
    region: "Global",
    eventAt: "",
    createdAt: now(),
    updatedAt: now(),
    version: 1,
    stage: "researching",
    demo: false,
    sources: [],
    claims: [],
    segments: [],
    assets: [],
    renders: [],
    corrections: [],
    pronunciations: {},
  };
}
export function wordCount(story: Story) {
  return story.segments
    .map((s) => s.text)
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
export function invalidate(story: Story): Story {
  return {
    ...story,
    version: story.version + 1,
    updatedAt: now(),
    stage: "drafting",
    approval: undefined,
    claims: story.claims.map((c) => ({ ...c, reviewed: false })),
  };
}
export function productionGates(story: Story) {
  return gates(story).filter((g) => g.code !== "review");
}
export function previewGates(story: Story) {
  // Human review and an unknown event date can wait for a watermarked private preview.
  // Factual support, contradictions, citations, translations and media rights cannot.
  return gates(story).filter(
    (g) =>
      ![
        "review",
        "provenance",
        "media-review",
        "media-rights",
        "quality",
      ].includes(g.code) && !(g.code === "date" && !story.eventAt),
  );
}
// Require an actual attribution phrase, not merely a passing mention of the outlet.
export function attributesReporting(text: string, publisher: string) {
  if (!publisher.trim()) return false;
  const outlet = publisher.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])(?:according to ${outlet}(?=$|[^\\p{L}\\p{N}])|${outlet} (?:reports|reported|says|said|writes|wrote)\\b)`,
    "iu",
  ).test(text);
}
export function gates(story: Story): Gate[] {
  const issues: Gate[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  for (const message of originGraphIssues(story.sources))
    add("source-origin", message);
  for (const message of editorialIssues(story))
    add("editorial-package", message);
  if (["held", "rejected"].includes(story.stage))
    add("hold", "Resume research before producing a held or rejected story.");
  if (!story.eventAt || Number.isNaN(Date.parse(story.eventAt)))
    add("date", "Set the event date; retrieval time is not the event time.");
  if (!story.segments.length)
    add("script", "Write at least one narration segment.");
  const words = wordCount(story);
  const minimum = NARRATION_LIMITS.min;
  if (words < minimum || words > NARRATION_LIMITS.max)
    add(
      "length",
      `Narration has ${words} words. Use ${minimum}–${NARRATION_LIMITS.max} words and at least 60 seconds of measured narration, excluding closing sources. Add supported context or hold the story.`,
    );
  const seen = new Set<string>();
  const assertions: Segment[] = [
    ...story.segments,
    ...editorialAssertions(story)
      .filter((a) => !a.id.startsWith("segment:"))
      .map((a) => ({ id: a.id, text: a.text, claimIds: a.claimIds })),
  ];
  for (const segment of assertions) {
    if (!segment.text.trim() || !segment.claimIds.length)
      add(
        "citation",
        `Segment ${segment.id.slice(0, 8)} needs text and linked claims.`,
      );
    for (const claimId of segment.claimIds) {
      const claim = story.claims.find((c) => c.id === claimId);
      if (claim?.status === "attributed reporting") {
        const attributed = claim.evidence.some((e) => {
          const source = story.sources.find((s) => s.id === e.sourceId);
          return (
            e.relation === "supports" &&
            source &&
            attributesReporting(claim.text, source.publisher) &&
            attributesReporting(segment.text, source.publisher)
          );
        });
        if (!attributed)
          add(
            "attribution",
            `${claimId}: name the supporting outlet in both the claim and segment ${segment.id}, for example “According to France 24, …”. On-screen credit alone is insufficient for attributed reporting.`,
          );
      }
      if (seen.has(claimId)) continue;
      seen.add(claimId);
      if (!claim) {
        add("missing-claim", "A script references a missing claim.");
        continue;
      }
      if (!claim.reviewed)
        add(
          "review",
          `${claimId}: editor must check the narration against evidence.`,
        );
      if (
        ![
          "supported fact",
          "attributed statement",
          "attributed reporting",
        ].includes(claim.status)
      )
        add(
          "unsupported",
          `${claimId}: ${claim.status}; hold or rewrite this claim.`,
        );
      const sources: Source[] = [];
      for (const e of claim.evidence) {
        const source = story.sources.find((s) => s.id === e.sourceId);
        if (
          !source ||
          !e.passage.trim() ||
          !source.text.includes(e.passage) ||
          !source.hash
        )
          add(
            "passage",
            `${claimId}: evidence must match the retrieved source snapshot.`,
          );
        else if (e.relation === "supports") sources.push(source);
        if (source?.research && !source.research.metadataReviewed)
          add(
            "provenance",
            `${claimId}: review the bot's source classification and originating lineage before production.`,
          );
        if (e.relation === "contradicts")
          add(
            "contradiction",
            `${claimId}: unresolved contradictory evidence requires a hold.`,
          );
        if (source && source.language !== "en" && !e.translation?.trim())
          add(
            "translation",
            `${claimId}: preserve an English translation for review.`,
          );
        if (source?.language === "en" && e.translation?.trim())
          add(
            "translation",
            `${claimId}: an English source must use its original passage. Remove the writer-supplied English paraphrase from the translation field.`,
          );
      }
      if (!sources.length)
        add("evidence", `${claimId}: add supporting evidence.`);
      if (
        claim.status === "supported fact" &&
        independentOrigins(
          story.sources,
          sources.map((s) => s.id),
        ).length < 2
      )
        add(
          "lineage",
          `${claimId}: seek independent evidence or use an attributed statement.`,
        );
      if (
        claim.status === "attributed statement" &&
        !sources.some((s) => s.kind === "primary")
      )
        add(
          "original",
          `${claimId}: an attributed statement needs the original source. For a news outlet’s account, use attributed reporting and name that outlet in the claim and narration.`,
        );
    }
    if (segment.assetId) {
      const asset = story.assets.find((a) => a.id === segment.assetId);
      if (asset) {
        for (const message of mediaRightsIssues(asset, "private-preview"))
          add("media-blocked", message);
        for (const message of mediaRightsIssues(asset, "public-video"))
          add("media-rights", message);
      }
      if (asset?.discovery && !asset.discovery.reviewed)
        add(
          "media-review",
          "Review the discovered image's identity, archive context, attribution and license obligations before final production.",
        );
      if (asset?.sourceMedia && !asset.sourceMedia.reviewed)
        add(
          "media-review",
          "Review the source photo/video context, credit and reuse permission before final production.",
        );
      if (
        !asset ||
        !asset.permission ||
        !asset.provenance ||
        !asset.creator ||
        !asset.context ||
        !asset.eventDate ||
        !asset.location
      )
        add(
          "rights",
          "Selected media needs rights, provenance, creator, event date, location, and context.",
        );
    }
  }
  const visualAssets = new Set([
    ...(story.shotOverrides || []).flatMap((s) =>
      s.assetId ? [s.assetId] : [],
    ),
    ...(
      story.renders.find((r) => r.version === story.version)?.shots || []
    ).flatMap((s) => (s.assetId ? [s.assetId] : [])),
  ]);
  for (const assetId of visualAssets) {
    const asset = story.assets.find((a) => a.id === assetId);
    if (asset) {
      for (const message of mediaRightsIssues(asset, "private-preview"))
        add("media-blocked", message);
      for (const message of mediaRightsIssues(asset, "public-video"))
        add("media-rights", message);
    }
    if (
      !asset ||
      !asset.creator ||
      !asset.permission ||
      !asset.provenance ||
      !asset.context ||
      !asset.eventDate ||
      !asset.location
    )
      add(
        "rights",
        "Each timeline visual needs complete attribution and context.",
      );
    if (
      (asset?.sourceMedia && !asset.sourceMedia.reviewed) ||
      (asset?.discovery && !asset.discovery.reviewed)
    )
      add(
        "media-review",
        "Review each timeline visual's identity, context and reuse permission before final production.",
      );
  }
  const render = story.renders.find((r) => r.version === story.version);
  if (render) {
    for (const message of productionIssues(story, render))
      add("production-contract", message);
    for (const message of qualityReleaseIssues(story, render))
      add("quality", message);
  }
  return issues;
}
