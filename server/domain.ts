import type { Story, Gate, Source } from "../shared/types.js";
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
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
      !["review", "provenance"].includes(g.code) &&
      !(g.code === "date" && !story.eventAt),
  );
}
export function gates(story: Story): Gate[] {
  const issues: Gate[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  if (["held", "rejected"].includes(story.stage))
    add("hold", "Resume research before producing a held or rejected story.");
  if (!story.eventAt || Number.isNaN(Date.parse(story.eventAt)))
    add("date", "Set the event date; retrieval time is not the event time.");
  if (!story.segments.length)
    add("script", "Write at least one narration segment.");
  const words = wordCount(story);
  const minimum = story.format === "brief" ? 60 : 140;
  if (words < minimum || words > 205)
    add(
      "length",
      `Narration has ${words} words. Use ${minimum}–205 words for this ${story.format === "brief" ? "short update" : "60–90 second draft"}.`,
    );
  const seen = new Set<string>();
  for (const segment of story.segments) {
    if (!segment.text.trim() || !segment.claimIds.length)
      add(
        "citation",
        `Segment ${segment.id.slice(0, 8)} needs text and linked claims.`,
      );
    for (const claimId of segment.claimIds) {
      if (seen.has(claimId)) continue;
      seen.add(claimId);
      const claim = story.claims.find((c) => c.id === claimId);
      if (!claim) {
        add("missing-claim", "A script references a missing claim.");
        continue;
      }
      if (!claim.reviewed)
        add(
          "review",
          `${claimId}: editor must check the narration against evidence.`,
        );
      if (!["supported fact", "attributed statement"].includes(claim.status))
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
      }
      if (!sources.length)
        add("evidence", `${claimId}: add supporting evidence.`);
      if (
        claim.status === "supported fact" &&
        new Set(sources.map((s) => s.lineage.toLowerCase().trim())).size < 2
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
          `${claimId}: an attributed statement needs the original source.`,
        );
    }
    if (segment.assetId) {
      const asset = story.assets.find((a) => a.id === segment.assetId);
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
  return issues;
}
