import test from "node:test";
import assert from "node:assert/strict";
import {
  repairCaptionLayout,
  parseCaptionCues,
  captionWidth,
  parseAudioScan,
  qualityReleaseIssues,
} from "../server/video-quality.js";
import { extendedVisualFixture } from "./fixtures/extended-visual-story.js";
import { stubQualityReport } from "./fixtures/quality-report.js";
import { repairVisualFallbacks } from "../server/visual-repair.js";
import { planEvidenceVisuals } from "../server/visual-plan.js";
import { gates, previewGates } from "../server/domain.js";
import type { Render, RenderedShot } from "../shared/types.js";

test("caption repair measures glyph width, merges readable short cues and never drops words or steals time", async () => {
  const input = [
    "00:00:00.000 --> 00:00:02.000\nWWWWWW WWWWWW WWWWWW WWWWWW",
    "00:00:02.000 --> 00:00:02.300\nThe",
    "00:00:02.300 --> 00:00:04.000\nagency spoke.",
  ];
  const result = await repairCaptionLayout(input);
  assert(result.changed);
  const cues = parseCaptionCues(result.cues);
  assert.equal(
    cues.map((c) => c.text).join(" "),
    parseCaptionCues(input)
      .map((c) => c.text)
      .join(" "),
  );
  assert(
    cues.every(
      (c, i) => c.lines.length <= 2 && (!i || c.start >= cues[i - 1].end),
    ),
  );
  for (const cue of cues)
    for (const line of cue.lines) assert((await captionWidth(line)) <= 936);
  assert.equal(cues.at(-1)!.end, 4);
  assert.equal(cues.length, 2);
});

test("fast captions can be regrouped using their own word spans without stretching speech", async () => {
  const words = [
    "The",
    "latest",
    "measurements.",
    "More",
    "results",
    "follow.",
  ].map((text, i) => ({ text, start: i * 500, end: (i + 1) * 500 }));
  const cues = [
    "00:00:00.000 --> 00:00:01.000\nThe latest",
    "00:00:01.000 --> 00:00:01.500\nmeasurements.",
    "00:00:01.500 --> 00:00:03.000\nMore results follow.",
  ];
  const result = await repairCaptionLayout(cues, words);
  const parsed = parseCaptionCues(result.cues);
  assert(
    parsed.every(
      (c) => c.text.length / (c.end - c.start) <= 22 && c.end - c.start >= 0.65,
    ),
  );
  assert.equal(
    parsed.map((c) => c.text).join(" "),
    words.map((w) => w.text).join(" "),
  );
  assert.equal(parsed[0].start, 0);
  assert.equal(parsed.at(-1)!.end, 3);
  for (const cue of parsed) {
    assert(words.some((w) => w.start / 1000 === cue.start));
    assert(words.some((w) => w.end / 1000 === cue.end));
  }
});

test("audio measurements preserve final open silence and reject missing measurement output", () => {
  const scan = parseAudioScan(
    'silence_start: 4.5\nsilence_end: 6.3\nsilence_start: 8\n{"input_i":"-16.3", "input_tp":"-1.8"}',
    10,
  );
  assert.equal(scan.lufs, -16.3);
  assert.equal(scan.truePeak, -1.8);
  assert.deepEqual(scan.silences, [
    { start: 4.5, end: 6.3 },
    { start: 8, end: 10 },
  ]);
  assert.throws(() => parseAudioScan("provider failed", 10), /measurements/);
});

test("quality receipt holds missing, failed and stale outputs, while private inspection stays possible", () => {
  const story = extendedVisualFixture();
  const render: Render = {
    version: story.version,
    card: "c.png",
    story: "s.png",
    video: "v.mp4",
    captions: "c.vtt",
    manifest: "m.json",
    duration: 78,
    createdAt: new Date().toISOString(),
    voice: "local",
  };
  assert(qualityReleaseIssues(story, render).length);
  stubQualityReport(story, render);
  assert.deepEqual(qualityReleaseIssues(story, render), []);
  story.segments[0].text += " Unchecked edit.";
  assert(qualityReleaseIssues(story, render).length);
  stubQualityReport(story, render);
  render.quality!.status = "held";
  render.quality!.findings.push({
    code: "visual-coverage",
    severity: "hold",
    message: "Insufficient visual coverage",
  });
  story.renders = [render];
  assert(gates(story).some((g) => g.code === "quality"));
  assert(!previewGates(story).some((g) => g.code === "quality"));
});

test("one visual repair uses only current exact-clause evidence and preserves narration timings", () => {
  const story = extendedVisualFixture();
  const visual = planEvidenceVisuals(story).find((v) => v.kind === "chart")!;
  const shot: RenderedShot = {
    id: "shot-01",
    segmentId: visual.segmentId,
    narration: visual.narration,
    kind: "fact",
    framing: "contain",
    start: 0,
    end: 8,
    label: "Text",
    credit: "Agency",
  };
  const repaired = repairVisualFallbacks(story, [shot]);
  assert.deepEqual(repaired.replaced, ["shot-01"]);
  assert.equal(repaired.shots[0].visualId, visual.id);
  assert.equal(repaired.shots[0].end, 8);
  assert.deepEqual(repairVisualFallbacks(story, repaired.shots).replaced, []);
  assert.deepEqual(
    repairVisualFallbacks(story, [
      { ...shot, narration: "No relevant evidence exists." },
    ]).shots,
    [{ ...shot, narration: "No relevant evidence exists." }],
  );
});
