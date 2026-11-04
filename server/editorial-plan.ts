import type {
  Asset,
  Story,
  RenderedShot,
  ShotOverride,
} from "../shared/types.js";
import { usedReportingSources } from "./production-record.js";
import { planEvidenceVisuals, sentences } from "./visual-plan.js";
import { visualReadingSeconds } from "../shared/visuals.js";
import { mediaRightsIssues, assetCredit } from "./media-rights.js";
import {
  mediaGeographyCompatible,
  graphicMatchesNarration,
} from "./media-context.js";

export const EDITORIAL_STYLE = "editorial-2026-11-04-v5";
export const normalize = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const tokens = (s: string) => normalize(s).match(/[a-z0-9]{4,}/g) || [];
export function assetMatchesNarration(asset: Asset, text: string) {
  if (mediaRightsIssues(asset, "private-preview").length) return false;
  if (!graphicMatchesNarration(asset, text)) return false;
  if (!mediaGeographyCompatible(asset, text)) return false;
  // A portrait must be named in the narration; an outlet's broad story match is insufficient.
  if (asset.subject && !normalize(text).includes(normalize(asset.subject)))
    return false;
  return !!(
    asset.file &&
    asset.creator &&
    asset.permission &&
    asset.provenance &&
    asset.context &&
    asset.eventDate &&
    asset.location
  );
}
export function shotFrames(duration: number, maximum = 6) {
  const total = Math.ceil(duration * 24);
  if (!Number.isFinite(total) || total < 72)
    throw new Error(
      "A visual timeline needs at least three seconds of narration.",
    );
  const count = Math.max(
    Math.ceil(total / (maximum * 24)),
    Math.min(Math.floor(total / 72), Math.round(total / (maximum * 18))),
  );
  const base = Math.floor(total / count),
    remainder = total % count;
  return Array.from(
    { length: count },
    (_, i) => base + (i < remainder ? 1 : 0),
  );
}
export interface NarratedScene {
  segmentId: string;
  text: string;
  claimIds: string[];
  sourceIds: string[];
  start: number;
  end: number;
  narrationDuration: number;
  narrationReused: boolean;
}
export function sourcesFor(story: Story, segmentId: string) {
  return usedReportingSources(story, segmentId);
}
export function validateShotOverrides(story: Story, overrides: ShotOverride[]) {
  const plan = planEvidenceVisuals(story);
  if (new Set(overrides.map((o) => o.id)).size !== overrides.length)
    throw new Error("Each shot can have only one override.");
  for (const shot of overrides) {
    const segment = story.segments.find((s) => s.id === shot.segmentId);
    if (!segment)
      throw new Error("The shot references a missing narration segment.");
    if (!/^shot-\d{2}$/.test(shot.id))
      throw new Error("Unknown shot identifier.");
    if (shot.kind === "media") {
      const asset = story.assets.find((a) => a.id === shot.assetId);
      if (!asset || !assetMatchesNarration(asset, segment.text))
        throw new Error(
          "Choose media with complete attribution and a subject named in this narration.",
        );
      if (
        asset.mediaType === "video" &&
        asset.sourceMedia?.duration &&
        (shot.videoStart || 0) + 3 > asset.sourceMedia.duration
      )
        throw new Error(
          "The clip needs at least three seconds after its selected start.",
        );
    } else if (shot.assetId)
      throw new Error("Fact and source graphics do not use a photo or clip.");
    if (
      ["document", "map", "timeline", "chart", "process", "quote"].includes(
        shot.kind,
      )
    ) {
      if (
        !plan.some(
          (v) =>
            v.id === shot.visualId &&
            v.segmentId === shot.segmentId &&
            v.kind === shot.kind,
        )
      )
        throw new Error(
          "Choose an explanatory visual supported by this segment's current evidence.",
        );
    } else if (shot.visualId)
      throw new Error("Only explanatory visuals use a visual reference.");
  }
}
export function planShots(
  story: Story,
  scenes: NarratedScene[],
  duration: number,
): RenderedShot[] {
  validateShotOverrides(story, story.shotOverrides || []);
  const visualPlan = planEvidenceVisuals(story);
  if (!scenes.length || scenes.some((s) => s.end - s.start < 3))
    throw new Error(
      "Each narration beat needs at least three seconds for a matched visual. Combine short supported segments before rebuilding.",
    );
  // Cut on narration-segment boundaries when each beat is long enough. Longer
  // dated/document explanations get reading time instead of arbitrary cuts.
  const partitions = scenes.flatMap((s) =>
    shotFrames(
      (Math.ceil(s.end * 24) - Math.ceil(s.start * 24)) / 24,
      visualPlan.some(
        (v) =>
          v.segmentId === s.segmentId &&
          ["timeline", "document", "chart", "process", "quote"].includes(
            v.kind,
          ),
      )
        ? 10
        : 6,
    ),
  );
  let frame = 0;
  const used = new Map<string, number>();
  let previousKind = "";
  return partitions.map((frames, i) => {
    const start = frame / 24,
      end = (frame += frames) / 24,
      midpoint = (start + end) / 2;
    const scene =
      scenes.find((s) => midpoint >= s.start && midpoint < s.end) ||
      scenes.at(-1)!;
    const segment = story.segments.find((s) => s.id === scene.segmentId)!;
    const sourceIds = new Set(sourcesFor(story, segment.id).map((s) => s.id));
    const clauses = sentences(segment.text);
    const position = Math.max(
      0,
      Math.min(0.999, (midpoint - scene.start) / scene.narrationDuration),
    );
    const wordPosition = Math.floor(
      position * segment.text.split(/\s+/).length,
    );
    let sentenceWords = 0;
    const excerpt =
      clauses.find(
        (sentence) =>
          (sentenceWords += sentence.split(/\s+/).length) > wordPosition,
      ) || clauses.at(-1)!;
    const words = new Set(tokens(excerpt));
    const ranked = story.assets
      .filter(
        (a) =>
          assetMatchesNarration(a, excerpt) &&
          !/pictured (?:are|is)|bowing before|statues of/i.test(
            a.sourceMedia?.title || "",
          ) &&
          (a.sourceMedia || a.subject || a.id === segment.assetId),
      )
      .map((a) => {
        const overlap = tokens(
          [a.subject, a.sourceMedia?.title, a.context]
            .filter(Boolean)
            .join(" "),
        ).filter((t) => words.has(t)).length;
        const score =
          overlap +
          (a.subject ? 10 : 0) +
          (a.mediaType === "video" ? 2 : 0) +
          (sourceIds.has(a.sourceMedia?.sourceId || "") ? 2 : 0) -
          (used.get(a.id) || 0) * 3;
        return { asset: a, score, overlap };
      })
      .filter(
        (a) =>
          a.score > 0 &&
          (a.asset.subject ||
            a.overlap >= 2 ||
            (segment.visualSelection === "manual" &&
              a.asset.id === segment.assetId)) &&
          (a.asset.mediaType !== "video" ||
            (a.asset.sourceMedia?.duration || 0) >= end - start),
      )
      .sort((a, b) => b.score - a.score);
    const previous = i ? used.get("last") : undefined;
    const nextAsset = ranked.find(
      (a) => a.asset.id !== story.assets[previous ?? -1]?.id,
    )?.asset;
    const chosen =
      i === 0
        ? ranked.find((a) => a.asset.mediaType === "video")?.asset || nextAsset
        : nextAsset;
    const choices = visualPlan.filter(
      (v) =>
        v.segmentId === segment.id &&
        (v.narration === excerpt || ["timeline", "process"].includes(v.kind)),
    );
    const available = choices.filter(
      (v) => end - start >= visualReadingSeconds(v.kind),
    );
    const visual =
      available.find(
        (v) =>
          ["chart", "process", "quote"].includes(v.kind) && !used.has(v.id),
      ) ||
      available.find((v) => v.kind === "timeline" && !used.has(v.id)) ||
      available.find((v) => v.kind === "map" && !used.has(v.id)) ||
      available.find((v) => v.kind === "document" && !used.has(v.id)) ||
      available.find((v) => v.kind !== previousKind) ||
      available[0];
    let automaticKind: ShotOverride["kind"] =
      visual && (!chosen || previousKind === "media" || i % 3 === 1)
        ? visual.kind
        : chosen
          ? "media"
          : i % 2
            ? "sources"
            : "fact";
    if (
      ["fact", "sources"].includes(automaticKind) &&
      automaticKind === previousKind
    )
      automaticKind = automaticKind === "fact" ? "sources" : "fact";
    const override = story.shotOverrides?.find(
      (o) =>
        o.id === `shot-${String(i + 1).padStart(2, "0")}` &&
        o.segmentId === segment.id,
    );
    let asset =
      override?.kind === "media"
        ? story.assets.find((a) => a.id === override.assetId)
        : automaticKind === "media" && !override
          ? chosen
          : undefined;
    const kind = override?.kind || automaticKind;
    const selectedVisual = override
      ? visualPlan.find(
          (v) =>
            v.id === override.visualId &&
            v.segmentId === segment.id &&
            v.kind === kind,
        )
      : kind === visual?.kind
        ? visual
        : undefined;
    if (
      selectedVisual &&
      end - start < visualReadingSeconds(selectedVisual.kind)
    )
      throw new Error(
        "This explanatory shot needs more reading time. Choose another supported visual for this shorter shot.",
      );
    if (selectedVisual)
      used.set(selectedVisual.id, (used.get(selectedVisual.id) || 0) + 1);
    previousKind = kind;
    if (asset) {
      used.set(asset.id, (used.get(asset.id) || 0) + 1);
      used.set("last", story.assets.indexOf(asset));
    } else used.delete("last");
    const maxStart = Math.max(
      0,
      (asset?.sourceMedia?.duration || 0) - (end - start),
    );
    const videoStart =
      asset?.mediaType === "video"
        ? Math.min(
            override?.videoStart ?? (used.get(asset.id)! - 1) * 5,
            maxStart,
          )
        : undefined;
    if (
      asset?.mediaType === "video" &&
      override?.videoStart !== undefined &&
      override.videoStart > maxStart + 0.01
    )
      throw new Error(
        "The selected video excerpt does not fit the complete shot.",
      );
    const sourceLabel = sourcesFor(story, segment.id)
      .map((s) => s.publisher)
      .filter((v, k, a) => a.indexOf(v) === k)
      .join(" · ");
    return {
      id: `shot-${String(i + 1).padStart(2, "0")}`,
      segmentId: scene.segmentId,
      kind,
      visualId: selectedVisual?.id,
      visual: selectedVisual,
      narration: excerpt,
      purpose:
        selectedVisual?.purpose ||
        (asset
          ? "Illustrate this narration clause with credited source or context media."
          : "Evidence is insufficient for an explanatory template; inspect this text fallback."),
      assetId: asset?.id,
      framing: override?.framing || (asset?.subject ? "portrait" : "contain"),
      videoStart,
      start,
      end,
      label:
        asset?.subject ||
        asset?.sourceMedia?.title ||
        (selectedVisual
          ? `${kind === "map" ? "Country locator" : kind === "timeline" ? "Dates in the account" : "Evidence excerpt"} · ${excerpt}`
          : kind === "sources"
            ? "Source records"
            : excerpt),
      credit: asset ? assetCredit(asset) : sourceLabel,
    };
  });
}
const time = (seconds: number) => {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
};
export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}
export function captionCues(words: CaptionWord[]) {
  const cues: string[] = [];
  let group: CaptionWord[] = [];
  const wrap = (items: CaptionWord[]) => {
    const lines: string[] = [""];
    for (const { text } of items) {
      if (lines.at(-1) && lines.at(-1)!.length + text.length + 1 > 27)
        lines.push(text);
      else lines[lines.length - 1] = (lines.at(-1) + " " + text).trim();
    }
    return lines;
  };
  const flush = () => {
    if (!group.length) return;
    cues.push(
      `${time(group[0].start / 1000)} --> ${time(group.at(-1)!.end / 1000)}\n${wrap(group).join("\n")}`,
    );
    group = [];
  };
  for (const word of words) {
    if (
      group.length &&
      (wrap([...group, word]).length > 2 ||
        group.length >= 7 ||
        word.start - group.at(-1)!.end > 450)
    )
      flush();
    group.push(word);
    if (/[.!?]$/.test(word.text)) flush();
  }
  flush();
  return cues;
}

// Monotonic alignment keeps the editor's spelling while using measured ASR spans.
// Raw recognition and differences remain in the manifest for playback review.
export function alignScriptWords(script: string, recorded: CaptionWord[]) {
  const expected = script.trim().split(/\s+/),
    n = expected.length,
    m = recorded.length;
  if (!n || !m)
    throw new Error("Script alignment needs both script and recognized words.");
  const clean = (s: string) => normalize(s).replace(/[^a-z0-9]/g, "");
  const small = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];
  const numberWords = (value: number): string =>
    value < 20
      ? small[value]
      : value < 100
        ? tens[Math.floor(value / 10)] + (value % 10 ? small[value % 10] : "")
        : value < 1000
          ? small[Math.floor(value / 100)] +
            "hundred" +
            (value % 100 ? numberWords(value % 100) : "")
          : value < 10000
            ? small[Math.floor(value / 1000)] +
              "thousand" +
              (value % 1000 ? numberWords(value % 1000) : "")
            : String(value);
  const ordinal: Record<string, string> = {
    first: "one",
    second: "two",
    third: "three",
    fourth: "four",
    fifth: "five",
    sixth: "six",
    seventh: "seven",
    eighth: "eight",
    ninth: "nine",
    tenth: "ten",
    eleventh: "eleven",
    twelfth: "twelve",
    thirteenth: "thirteen",
    fourteenth: "fourteen",
    fifteenth: "fifteen",
    sixteenth: "sixteen",
    seventeenth: "seventeen",
    eighteenth: "eighteen",
    nineteenth: "nineteen",
    twentieth: "twenty",
    thirtieth: "thirty",
  };
  const variants = (s: string) => {
    const value = clean(s),
      result = [value];
    if (/^\d{1,4}$/.test(value)) {
      const numeric = Number(value);
      result.push(numberWords(numeric));
      if (numeric >= 2000 && numeric < 2100)
        result.push(
          "twenty" + (numeric % 100 ? numberWords(numeric % 100) : "hundred"),
        );
    }
    return result;
  };
  const cardinal = (s: string) =>
    s
      .split(/\s+/)
      .map((w) => ordinal[clean(w)] || clean(w))
      .filter(
        (w, i, all) =>
          w !== "and" || !all.some((v) => v === "hundred" || v === "thousand"),
      )
      .join("");
  const distance = (a: string, b: string) => {
    if (a === b) return 0;
    let row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++)
        next[j] = Math.min(
          next[j - 1] + 1,
          row[j] + 1,
          row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      row = next;
    }
    return row[b.length] / Math.max(a.length, b.length, 1);
  };
  const cost = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  const back = Array.from({ length: n + 1 }, () =>
    Array<{ a: number; b: number } | undefined>(m + 1),
  );
  cost[0][0] = 0;
  const update = (
    i: number,
    j: number,
    a: number,
    b: number,
    value: number,
  ) => {
    if (value < cost[i + a][j + b]) {
      cost[i + a][j + b] = value;
      back[i + a][j + b] = { a, b };
    }
  };
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      if (!Number.isFinite(cost[i][j])) continue;
      if (i < n) update(i, j, 1, 0, cost[i][j] + 0.95);
      if (j < m) update(i, j, 0, 1, cost[i][j] + 0.85);
      for (let a = 1; a <= 2 && i + a <= n; a++)
        for (let b = 1; b <= 8 && j + b <= m; b++) {
          const spoken = recorded
              .slice(j, j + b)
              .map((w) => w.text)
              .join(" "),
            target = expected.slice(i, i + a).join(" ");
          const match = Math.min(
            ...variants(target).map((v) =>
              Math.min(
                distance(v, clean(spoken)),
                distance(v, cardinal(spoken)),
              ),
            ),
          );
          if (a > 1 && match > 0.1) continue;
          update(i, j, a, b, cost[i][j] + match * 1.7 + 0.12 * (a + b - 2));
        }
    }
  const blocks: { i: number; j: number; a: number; b: number }[] = [];
  let i = n,
    j = m;
  while (i || j) {
    const step = back[i][j]!;
    i -= step.a;
    j -= step.b;
    blocks.push({ i, j, ...step });
  }
  blocks.reverse();
  const aligned: CaptionWord[] = [],
    adjustments: {
      script: string;
      recognized: string;
      start: number;
      end: number;
    }[] = [];
  for (const block of blocks) {
    if (!block.a) continue;
    if (!block.b)
      throw new Error(
        "A script word has no measured speech span. Inspect the narration and transcript before rebuilding.",
      );
    const target = expected.slice(block.i, block.i + block.a),
      recognition = recorded.slice(block.j, block.j + block.b);
    const start = recognition[0]?.start ?? (recorded[block.j - 1]?.end || 0);
    const end =
      recognition.at(-1)?.end ??
      Math.max(start + 20, recorded[block.j]?.start || start + 20);
    const lengths = target.map((w) => Math.max(clean(w).length, 1)),
      total = lengths.reduce((a, b) => a + b, 0);
    let elapsed = 0;
    target.forEach((text, k) => {
      const from = start + ((end - start) * elapsed) / total;
      elapsed += lengths[k];
      aligned.push({
        text,
        start: from,
        end: start + ((end - start) * elapsed) / total,
      });
    });
    if (
      clean(target.join("")) !== clean(recognition.map((w) => w.text).join(""))
    )
      adjustments.push({
        script: target.join(" "),
        recognized: recognition.map((w) => w.text).join(" "),
        start,
        end,
      });
  }
  return { words: aligned, adjustments };
}
