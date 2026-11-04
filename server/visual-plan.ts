import { createHash } from "node:crypto";
import geography from "./references/geography.json" with { type: "json" };
import type { Story, RenderedShot } from "../shared/types.js";
import {
  VISUAL_STANDARD,
  type EvidenceVisual,
  type VisualEvidence,
  type VisualCoverage,
  type DocumentVisual,
  type MapVisual,
  type TimelineVisual,
  type VisualDraft,
} from "../shared/visuals.js";
import { extraClauseVisuals, processVisuals } from "./explanatory-facts.js";
import {
  mediaGeographyCompatible,
  graphicMatchesNarration,
} from "./media-context.js";

export { geography };
const words = (s: string) =>
  new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
const overlap = (a: string, b: string) =>
  [...words(a)].filter((w) => words(b).has(w)).length;
export const sentences = (text: string) =>
  [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(text)]
    .map((s) => s.segment.trim())
    .filter(Boolean);
const identity = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
const evidenceText = (e: VisualEvidence) => e.translation || e.passage;
function excerpt(value: string, narration: string, max = 230) {
  const candidates = sentences(value).filter((s) => s.length <= max);
  const selected = candidates.sort(
    (a, b) => overlap(b, narration) - overlap(a, narration),
  )[0];
  // Never paraphrase or stitch different passages into a quotation.
  return (
    selected ||
    value
      .slice(0, max)
      .replace(/\s+\S*$/, "")
      .trim()
  );
}
function refs(story: Story, segmentId: string): VisualEvidence[] {
  const segment = story.segments.find((s) => s.id === segmentId);
  return story.claims
    .filter((c) => segment?.claimIds.includes(c.id))
    .flatMap((c) =>
      c.evidence
        .filter((e) => {
          const source = story.sources.find((s) => s.id === e.sourceId);
          return (
            e.relation === "supports" &&
            source?.text.includes(e.passage) &&
            !!e.passage.trim() &&
            (source.language === "en" || !!e.translation?.trim())
          );
        })
        .map((e) => ({
          claimId: c.id,
          sourceId: e.sourceId,
          passage: e.passage,
          ...(e.translation &&
          story.sources.find((s) => s.id === e.sourceId)?.language !== "en"
            ? { translation: e.translation }
            : {}),
        })),
    );
}
function mention(text: string, alias: string) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  ).exec(text)?.[1];
}
const months =
  "January February March April May June July August September October November December".split(
    " ",
  );
export function explicitDates(text: string) {
  const full = months.join("|");
  const pattern = new RegExp(
    `\\b(?:\\d{4}-\\d{2}-\\d{2}|(?:${full}) \\d{1,2},? \\d{4}|\\d{1,2} (?:${full}) \\d{4}|(?:18|19|20|21)\\d{2})\\b`,
    "gi",
  );
  return [...text.matchAll(pattern)].flatMap((m) => {
    const date = m[0];
    let year: number,
      month = 1,
      day = 1;
    if (/^\d{4}-/.test(date)) [year, month, day] = date.split("-").map(Number);
    else if (/^\d{4}$/.test(date)) year = Number(date);
    else {
      const name = months.findIndex((name) =>
        date.toLowerCase().includes(name.toLowerCase()),
      );
      month = name + 1;
      const digits = date.match(/\d+/g)!.map(Number);
      [day, year] = digits;
    }
    const order = Date.UTC(year!, month - 1, day);
    const check = new Date(order);
    return check.getUTCFullYear() === year! &&
      check.getUTCMonth() === month - 1 &&
      check.getUTCDate() === day
      ? [{ date, order }]
      : [];
  });
}

/** Every displayed factual field is an exact substring of linked evidence.
 * Geography is a labelled locator reference, never an incident coordinate. */
export function planEvidenceVisuals(story: Story): EvidenceVisual[] {
  const plan: EvidenceVisual[] = [];
  const add = (value: VisualDraft) => {
    const complete = {
      ...value,
      id: `visual-${identity(value)}`,
    } as EvidenceVisual;
    if (!plan.some((v) => v.id === complete.id)) plan.push(complete);
  };
  for (const segment of story.segments) {
    const evidence = refs(story, segment.id);
    if (!evidence.length) continue;
    for (const narration of sentences(segment.text)) {
      extraClauseVisuals(segment.id, narration, evidence).forEach(add);
      const ranked = [...evidence].sort(
        (a, b) =>
          overlap(excerpt(evidenceText(b), narration), narration) -
          overlap(excerpt(evidenceText(a), narration), narration),
      );
      const ref = ranked[0];
      const quoted = excerpt(evidenceText(ref), narration);
      if (quoted.length >= 20 && overlap(quoted, narration) >= 2)
        add({
          kind: "document",
          segmentId: segment.id,
          narration,
          purpose: "Show the exact saved passage behind this narration clause.",
          evidence: [ref],
          excerpt: quoted,
          translated: !!ref.translation,
        });
      const places = geography.places
        .flatMap((place) => {
          const alias = place.aliases.find(
            (a) =>
              mention(narration, a) &&
              ranked.some((e) => mention(evidenceText(e), a)),
          );
          if (!alias) return [];
          // Do not turn maritime names into a country-location assertion.
          if (/China Sea|Gulf of Guinea/i.test(narration)) return [];
          return [
            {
              id: place.id,
              name: place.name,
              mention: mention(narration, alias)!,
              lon: place.lon,
              lat: place.lat,
            },
          ];
        })
        .slice(0, 3);
      if (places.length)
        add({
          kind: "map",
          segmentId: segment.id,
          narration,
          purpose:
            "Locate countries explicitly named in this clause and its linked evidence; no event-site claim.",
          evidence: places
            .map((p) =>
              ranked.find((e) => mention(evidenceText(e), p.mention))!,
            )
            .filter((e, i, all) => all.indexOf(e) === i),
          places,
          geographyVersion: geography.commit,
        });
    }
    processVisuals(segment.id, segment.text, evidence).forEach(add);
    const spokenDates = new Set(
      explicitDates(segment.text).map((d) => d.order),
    );
    const items = evidence
      .flatMap((e) =>
        sentences(evidenceText(e)).flatMap((sentence) => {
          const dates = explicitDates(sentence);
          // A date range or several dates in one sentence cannot establish distinct events.
          if (
            dates.length !== 1 ||
            !spokenDates.has(dates[0].order) ||
            sentence.length > 220
          )
            return [];
          return [{ ...dates[0], excerpt: sentence, evidence: e }];
        }),
      )
      .filter(
        (item, i, all) =>
          all.findIndex((other) => other.order === item.order) === i,
      )
      .sort((a, b) => a.order - b.order)
      .slice(0, 3);
    if (items.length >= 2)
      add({
        kind: "timeline",
        segmentId: segment.id,
        narration: segment.text,
        purpose:
          "Compare explicit dates already spoken in this beat; preserve the source wording about plans and uncertainty.",
        evidence: items.map((i) => i.evidence),
        items,
      });
  }
  return plan;
}

export function visualPlanIssues(story: Story, shots: RenderedShot[]) {
  const current = planEvidenceVisuals(story);
  return shots.flatMap((shot) => {
    if (shot.kind === "media") {
      const asset = story.assets.find((a) => a.id === shot.assetId);
      const narration =
        shot.narration ||
        story.segments.find((s) => s.id === shot.segmentId)?.text ||
        "";
      if (
        !asset ||
        !graphicMatchesNarration(asset, narration) ||
        !mediaGeographyCompatible(asset, narration) ||
        (asset.subject &&
          !narration.toLowerCase().includes(asset.subject.toLowerCase()))
      )
        return [
          `${shot.id}: selected media conflicts with the narration's place or named subject. Rebuild with a relevant visual.`,
        ];
      return [];
    }
    if (
      !["document", "map", "timeline", "chart", "process", "quote"].includes(
        shot.kind,
      )
    )
      return [];
    const expected = current.find(
      (v) =>
        v.id === shot.visualId &&
        v.segmentId === shot.segmentId &&
        v.kind === shot.kind,
    );
    return !expected || JSON.stringify(expected) !== JSON.stringify(shot.visual)
      ? [
          `${shot.id}: the explanatory visual no longer matches its narration and exact evidence. Rebuild this revision.`,
        ]
      : [];
  });
}
export function visualCoverage(
  shots: RenderedShot[],
  narrationSeconds: number,
): VisualCoverage {
  let purposefulSeconds = 0,
    fullTextSeconds = 0;
  for (const shot of shots) {
    const duration = Math.max(
      0,
      Math.min(narrationSeconds, shot.end) - Math.max(0, shot.start),
    );
    if ((shot.kind === "media" && shot.assetId) || shot.visual)
      purposefulSeconds += duration;
    else fullTextSeconds += duration;
  }
  const percent = narrationSeconds
    ? Math.min(100, (100 * purposefulSeconds) / narrationSeconds)
    : 0;
  const warnings: string[] = [];
  if (percent < 90)
    warnings.push(
      `Purposeful visual coverage is ${percent.toFixed(0)}%; target at least 90%. Add relevant media or usable supporting passages.`,
    );
  const kinds = new Set(
    shots.filter((s) => s.visual || s.assetId).map((s) => s.kind),
  );
  if (kinds.size < 2)
    warnings.push(
      "Only one visual treatment is supported. Review whether the story needs additional footage, places or dated context; do not invent variety.",
    );
  return {
    standard: VISUAL_STANDARD,
    narrationSeconds,
    purposefulSeconds,
    fullTextSeconds,
    percent,
    warnings,
  };
}
