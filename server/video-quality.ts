import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import type { Story, Render } from "../shared/types.js";
import {
  QUALITY_STANDARD as policy,
  type QualityReport,
  type QualityFinding,
} from "../shared/quality.js";
import { CAPTION_STYLE } from "../shared/visuals.js";
import { packageFingerprint, editorialIssues } from "./editorial-check.js";
import { productionIssues } from "./production-record.js";
import { visualCoverage, visualPlanIssues } from "./visual-plan.js";
import { exec } from "./media.js";
import type { CaptionWord } from "./editorial-plan.js";

const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export function qualityFingerprint(story: Story, render: Render) {
  return hash(
    JSON.stringify({
      standard: policy.version,
      package: packageFingerprint(story),
      title: story.title,
      summary: story.summary,
      segments: story.segments,
      pronunciations: story.pronunciations,
      assets: story.assets,
      overrides: story.shotOverrides,
      version: story.version,
      profile: render.productionProfile,
      production: render.production,
      shots: render.shots,
      duration: render.duration,
      captions: render.captions,
      video: render.video,
    }),
  );
}
export function qualityReleaseIssues(story: Story, render: Render) {
  const report = render.quality;
  if (
    !report ||
    report.standard !== policy.version ||
    report.fingerprint !== qualityFingerprint(story, render)
  )
    return [
      "Create a current render with the automatic quality report before final approval.",
    ];
  return report.findings
    .filter((f) => f.severity === "hold")
    .map((f) => f.message)
    .concat(
      report.status !== "passed" &&
        !report.findings.some((f) => f.severity === "hold")
        ? ["The quality report has not passed."]
        : [],
    );
}

const seconds = (text: string) =>
  text.split(":").reduce((n, part) => n * 60 + Number(part), 0);
export function parseCaptionCues(cues: string[]) {
  return cues.map((cue) => {
    const [span, ...lines] = cue.split("\n");
    const [start, end] = span.split(" --> ").map(seconds);
    return { start, end, lines, text: lines.join(" ") };
  });
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const widths = new Map<string, number>();
export async function captionWidth(text: string) {
  if (widths.has(text)) return widths.get(text)!;
  const info = await sharp({
    text: {
      text: escape(text),
      font: `${CAPTION_STYLE.font} Bold ${CAPTION_STYLE.size}`,
      dpi: 72,
      rgba: true,
    },
  }).metadata();
  const width = info.width || 0;
  if (widths.size > 2000) widths.clear();
  widths.set(text, width);
  return width;
}

// Reflow text inside the original speech spans. Never extend a cue across its
// next neighbour or delete words to make the readability checks pass.
export async function repairCaptionLayout(
  cues: string[],
  words?: CaptionWord[],
) {
  const parsed = parseCaptionCues(cues);
  const wrap = async (text: string) => {
    const lines = [""];
    for (const word of text.split(/\s+/)) {
      const joined = (lines.at(-1)! + " " + word).trim();
      if (lines.at(-1) && (await captionWidth(joined)) > policy.captionWidth)
        lines.push(word);
      else lines[lines.length - 1] = joined;
    }
    return lines;
  };
  const repaired: string[] = [];
  for (let i = 0; i < parsed.length; i++) {
    let cue = parsed[i];
    const next = parsed[i + 1];
    if (
      next &&
      (cue.end - cue.start < policy.minCaptionSeconds ||
        next.end - next.start < policy.minCaptionSeconds) &&
      next.start - cue.end < 0.15 &&
      next.end - cue.start <= policy.maxCaptionSeconds
    ) {
      const text = cue.text + " " + next.text;
      const lines = await wrap(text);
      if (
        lines.length <= 2 &&
        text.length / (next.end - cue.start) <= policy.maxCaptionCps
      ) {
        cue = { ...cue, end: next.end, text, lines };
        i++;
      }
    }
    // Keep the exact original millisecond boundaries, including after a merge.
    const format = (s: number) =>
      new Date(Math.round(s * 1000)).toISOString().slice(11, 23);
    repaired.push(
      `${format(cue.start)} --> ${format(cue.end)}\n${(await wrap(cue.text)).join("\n")}`,
    );
  }
  // When measured word spans are available, solve one bounded regrouping pass
  // for short/fast cues. A word's own start/end stays attached to that word.
  // If no readable partition exists, retain the inspectable layout and hold it.
  if (
    words?.length &&
    parseCaptionCues(repaired).some(
      (c) =>
        c.end - c.start < policy.minCaptionSeconds ||
        c.text.length / (c.end - c.start) > policy.maxCaptionCps,
    )
  ) {
    const best = new Map<
      number,
      { cost: number; previous: number; cue: string }
    >();
    best.set(0, { cost: 0, previous: -1, cue: "" });
    const format = (ms: number) =>
      new Date(Math.round(ms)).toISOString().slice(11, 23);
    for (let i = 0; i < words.length; i++) {
      const prior = best.get(i);
      if (!prior) continue;
      for (let j = i; j < Math.min(words.length, i + 12); j++) {
        if (j > i && words[j].start - words[j - 1].end > 450) break;
        const duration = (words[j].end - words[i].start) / 1000;
        if (duration > policy.maxCaptionSeconds) break;
        const text = words
          .slice(i, j + 1)
          .map((w) => w.text)
          .join(" ");
        const lines = await wrap(text);
        if (lines.length > 2) break;
        if (
          duration < policy.minCaptionSeconds ||
          text.length / duration > policy.maxCaptionCps ||
          (await Promise.all(lines.map(captionWidth))).some(
            (w) => w > policy.captionWidth,
          )
        )
          continue;
        const cost = prior.cost + 1 + (/[.!?]$/.test(words[j].text) ? 0 : 0.3);
        if (!best.has(j + 1) || best.get(j + 1)!.cost > cost)
          best.set(j + 1, {
            cost,
            previous: i,
            cue: `${format(words[i].start)} --> ${format(words[j].end)}\n${lines.join("\n")}`,
          });
      }
    }
    if (best.has(words.length)) {
      const regrouped: string[] = [];
      let position = words.length;
      while (position > 0) {
        const step = best.get(position)!;
        regrouped.unshift(step.cue);
        position = step.previous;
      }
      return {
        cues: regrouped,
        changed: JSON.stringify(regrouped) !== JSON.stringify(cues),
      };
    }
  }
  return {
    cues: repaired,
    changed: JSON.stringify(repaired) !== JSON.stringify(cues),
  };
}

export function parseAudioScan(stderr: string, duration: number) {
  const json = stderr.match(/\{\s*"input_i"[\s\S]*?\}/g)?.at(-1);
  if (!json)
    throw new Error(
      "Audio measurements were not returned; quality check stopped.",
    );
  const value = JSON.parse(json);
  const lufs = Number(value.input_i),
    truePeak = Number(value.input_tp);
  const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) =>
    Number(m[1]),
  );
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) =>
    Number(m[1]),
  );
  return {
    lufs,
    truePeak,
    stats: value,
    silences: starts.map((start, i) => ({
      start,
      end: Math.min(ends[i] ?? duration, duration),
    })),
  };
}
export async function scanAudio(file: string, duration: number) {
  const result = await exec(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      file,
      "-t",
      String(duration),
      "-vn",
      "-af",
      `silencedetect=noise=-45dB:d=${policy.silenceSeconds},loudnorm=I=${policy.normalizationLufs}:TP=${policy.normalizationTruePeak}:LRA=11:print_format=json`,
      "-f",
      "null",
      "-",
    ],
    { timeout: 120000, maxBuffer: 2_000_000 },
  );
  return parseAudioScan(result.stderr, duration);
}
export async function normalizeAudio(
  input: string,
  output: string,
  scan: Awaited<ReturnType<typeof scanAudio>>,
) {
  const s = scan.stats;
  for (const key of [
    "input_i",
    "input_tp",
    "input_lra",
    "input_thresh",
    "target_offset",
  ])
    if (!Number.isFinite(Number(s[key])))
      throw new Error(
        "Silent or invalid audio cannot be repaired by normalization.",
      );
  await exec(
    "ffmpeg",
    [
      "-y",
      "-i",
      input,
      "-af",
      `loudnorm=I=${policy.normalizationLufs}:TP=${policy.normalizationTruePeak}:LRA=11:measured_I=${s.input_i}:measured_TP=${s.input_tp}:measured_LRA=${s.input_lra}:measured_thresh=${s.input_thresh}:offset=${s.target_offset}:linear=true`,
      "-ar",
      "48000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      output,
    ],
    { timeout: 120000, maxBuffer: 2_000_000 },
  );
}

export async function checkVideoQuality(
  story: Story,
  render: Render,
  input: {
    video: string;
    audio: string;
    cues: string[];
    repairs?: QualityReport["repairs"];
  },
): Promise<QualityReport> {
  const findings: QualityFinding[] = [];
  const add = (
    code: string,
    message: string,
    severity: QualityFinding["severity"] = "hold",
    at?: number,
  ) =>
    findings.push({
      code,
      message,
      severity,
      ...(at === undefined ? {} : { at }),
    });
  const narration = render.production?.narrationDuration || 0;
  for (const issue of productionIssues(story, render)) add("production", issue);
  if (!story.editorial?.check)
    add(
      "evidence",
      "The complete story package needs a separate evidence check; narration-only legacy review is insufficient for automatic readiness.",
    );
  else for (const issue of editorialIssues(story)) add("evidence", issue);
  for (const issue of visualPlanIssues(story, render.shots || []))
    add("visual-context", issue);
  const coverage = visualCoverage(render.shots || [], narration);
  if (coverage.percent < policy.minVisualCoverage)
    add(
      "visual-coverage",
      `Only ${coverage.percent.toFixed(1)}% of narration has purposeful visuals; require at least ${policy.minVisualCoverage}%. Add evidence-linked visuals rather than text padding.`,
    );
  if (
    new Set(
      (render.shots || [])
        .filter((s) => s.visual || s.assetId)
        .map((s) => s.kind),
    ).size < 2
  )
    add(
      "visual-variety",
      "Only one visual treatment is available; inspect whether it explains the story clearly.",
      "warning",
    );
  const shots = render.shots || [];
  if (
    !shots.length ||
    Math.abs(shots[0].start) > 0.05 ||
    Math.abs(shots.at(-1)!.end - narration) > 0.065 ||
    shots.some(
      (s, i) =>
        !Number.isFinite(s.start) ||
        !Number.isFinite(s.end) ||
        s.end - s.start < 3 ||
        s.end - s.start > 10.05 ||
        (i > 0 && Math.abs(s.start - shots[i - 1].end) > 0.05),
    )
  )
    add(
      "visual-timing",
      "The visual timeline must cover the complete narration without gaps, overlaps or unreadably short shots.",
    );
  for (const shot of shots) {
    if (
      shot.visual &&
      shot.visual.narration !== shot.narration &&
      !["timeline", "process"].includes(shot.kind)
    )
      add(
        "visual-clause",
        `${shot.id}: the selected graphic belongs to a different narration clause.`,
        "hold",
        shot.start,
      );
    if (shot.kind === "media") {
      const asset = story.assets.find((a) => a.id === shot.assetId);
      if (
        !asset ||
        (!asset.rights?.contextChecked &&
          !(asset.sourceMedia?.reviewed || asset.discovery?.reviewed))
      )
        add(
          "media-identity",
          `${shot.id}: image identity and event context still need review.`,
          "hold",
          shot.start,
        );
    }
  }
  const cues = parseCaptionCues(input.cues);
  let maxCps = 0;
  const expected = story.segments
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    cues
      .map((c) => c.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim() !== expected
  )
    add("caption-text", "Captions must retain every narration word in order.");
  for (const [i, cue] of cues.entries()) {
    const duration = cue.end - cue.start,
      cps = cue.text.length / duration;
    maxCps = Math.max(maxCps, cps);
    if (
      !Number.isFinite(duration) ||
      cue.start < 0 ||
      duration <= 0 ||
      cue.end > narration + 0.1 ||
      (i && cue.start < cues[i - 1].end - 0.001)
    )
      add(
        "caption-timing",
        "Caption timestamps overlap or fall outside narration.",
        "hold",
        cue.start,
      );
    if (
      duration < policy.minCaptionSeconds ||
      duration > policy.maxCaptionSeconds ||
      cps > policy.maxCaptionCps
    )
      add(
        "caption-reading",
        `Caption ${i + 1} needs ${duration.toFixed(2)}s at ${cps.toFixed(1)} characters/second; inspect its speech timing.`,
        "hold",
        cue.start,
      );
    if (
      cue.lines.length > 2 ||
      (await Promise.all(cue.lines.map(captionWidth))).some(
        (w) => w > policy.captionWidth,
      )
    )
      add(
        "caption-layout",
        `Caption ${i + 1} exceeds the two-line portrait safe area.`,
        "hold",
        cue.start,
      );
  }
  if (render.productionProfile?.captionProvider !== "assemblyai")
    add(
      "caption-alignment",
      "Caption timing is estimated; playback review is still required for speech alignment.",
      "warning",
    );
  for (const warning of render.captionWarnings || [])
    add("caption-recognition", warning);
  let decoded = false;
  try {
    const probe = JSON.parse(
      (
        await exec(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            input.video,
          ],
          { timeout: 30000, maxBuffer: 1_000_000 },
        )
      ).stdout,
    );
    const video = probe.streams.find((s: any) => s.codec_type === "video"),
      audio = probe.streams.find((s: any) => s.codec_type === "audio");
    if (
      video?.width !== 1080 ||
      video?.height !== 1920 ||
      video?.codec_name !== "h264" ||
      video?.pix_fmt !== "yuv420p" ||
      audio?.codec_name !== "aac" ||
      video?.avg_frame_rate !== "24/1" ||
      Math.abs(Number(probe.format.duration) - render.duration) > 0.15
    )
      add(
        "file-profile",
        "The final file does not match the portrait H.264/AAC production profile or timing.",
      );
    await exec(
      "ffmpeg",
      [
        "-v",
        "error",
        "-xerror",
        "-i",
        input.video,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-f",
        "null",
        "-",
      ],
      { timeout: 180000, maxBuffer: 1_000_000 },
    );
    decoded = true;
  } catch {
    add(
      "file-decode",
      "The complete final video could not be decoded; inspect the file before continuing.",
    );
  }
  let lufs: number | undefined, truePeak: number | undefined;
  try {
    const scan = await scanAudio(input.video, narration);
    ({ lufs, truePeak } = scan);
    if (
      !Number.isFinite(lufs) ||
      !Number.isFinite(truePeak) ||
      lufs < policy.minLufs ||
      lufs > policy.maxLufs ||
      truePeak > policy.maxTruePeak
    )
      add(
        "audio-level",
        `Narration loudness/peak failed (${lufs} LUFS, ${truePeak} dBTP).`,
      );
    for (const silence of scan.silences)
      if (silence.end - silence.start >= policy.silenceSeconds)
        add(
          "audio-silence",
          `Narration has ${(silence.end - silence.start).toFixed(1)}s of silence; inspect the speech without padding the minute.`,
          "hold",
          silence.start,
        );
  } catch {
    add("audio-measurement", "Narration audio measurements are unavailable.");
  }
  return {
    standard: policy.version,
    fingerprint: qualityFingerprint(story, render),
    checkedAt: new Date().toISOString(),
    status: findings.some((f) => f.severity === "hold") ? "held" : "passed",
    findings,
    repairs: input.repairs || [],
    measurements: {
      narrationSeconds: narration,
      visualCoverage: coverage.percent,
      captionCues: cues.length,
      maxCaptionCps: maxCps,
      lufs,
      truePeak,
      decoded,
      videoHash: hash(await readFile(input.video)),
      audioHash: hash(await readFile(input.audio)),
    },
  };
}
