import test from "node:test";
import assert from "node:assert/strict";
import { newStory, previewGates, gates, now } from "../server/domain.js";
import {
  shotFrames,
  planShots,
  captionCues,
  alignScriptWords,
  validateShotOverrides,
  assetMatchesNarration,
  type NarratedScene,
} from "../server/editorial-plan.js";
import {
  narrationKey,
  digest,
  cacheBytes,
  cachedBytes,
  cachePath,
} from "../server/render-cache.js";
import {
  shotOverlay,
  openingHeadline,
  shotMaterial,
} from "../server/editorial-art.js";
import { rm, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import path from "node:path";
import { dataDir } from "../server/db.js";
import type { Asset } from "../shared/types.js";

function fixture() {
  const story = newStory("A source-linked update");
  story.format = "brief";
  story.eventAt = "2026-11-01";
  story.sources = [
    {
      id: "S",
      publisher: "Agency",
      title: "Original announcement",
      author: "Press office",
      url: "https://agency.example/report",
      publishedAt: "2026-11-01",
      retrievedAt: now(),
      hash: "h",
      text: "The agency announced its programme.",
      language: "en",
      lineage: "Agency",
      kind: "primary",
      usage: "Fixture",
    },
  ];
  story.claims = [
    {
      id: "C",
      text: "The agency announced its programme.",
      status: "attributed statement",
      reviewed: false,
      evidence: [
        { sourceId: "S", passage: story.sources[0].text, relation: "supports" },
      ],
    },
  ];
  story.segments = [
    {
      id: "N",
      text: Array(10).fill("The agency announced its programme.").join(" "),
      claimIds: ["C"],
    },
  ];
  return story;
}
const asset = (id: string, subject?: string): Asset => ({
  id,
  subject,
  file: "a.png",
  creator: "Creator",
  permission: "CC BY 4.0",
  provenance: "https://agency.example/photo",
  eventDate: "2020-01-01",
  location: "Warsaw",
  archive: true,
  context: "Archive portrait",
});

test("script captions preserve names and numeric dates across split recognition tokens", () => {
  const recorded = [
    "Judge",
    "Anna",
    "Corwin",
    "Piotrowska",
    "spoke",
    "on",
    "October",
    "twenty",
    "ninth,",
    "twenty",
    "twenty",
    "six.",
  ].map((text, i) => ({ text, start: i * 300, end: i * 300 + 250 }));
  const script = "Judge Anna Korwin-Piotrowska spoke on October 29, 2026.";
  const result = alignScriptWords(script, recorded);
  assert.equal(result.words.map((w) => w.text).join(" "), script);
  assert.deepEqual(
    result.words.find((w) => w.text === "Korwin-Piotrowska"),
    { text: "Korwin-Piotrowska", start: 600, end: 1150 },
  );
  assert.deepEqual(
    result.words.find((w) => w.text === "29,"),
    { text: "29,", start: 2100, end: 2650 },
  );
  assert.deepEqual(
    result.words.find((w) => w.text === "2026."),
    { text: "2026.", start: 2700, end: 3550 },
  );
  assert(
    result.words.every(
      (w, i) => w.end > w.start && (!i || w.start >= result.words[i - 1].end),
    ),
  );
  assert(result.adjustments.some((a) => a.script === "Korwin-Piotrowska"));
  assert.throws(
    () =>
      alignScriptWords("The agency announced a complex programme.", [
        { text: "The", start: 0, end: 200 },
        { text: "programme.", start: 1200, end: 1600 },
      ]),
    /no measured speech span/,
  );
});
test("shot cadence covers the complete narration with no short tail or gap", () => {
  for (let duration = 20; duration <= 90; duration += 0.173) {
    const frames = shotFrames(duration);
    assert(frames.every((f) => f >= 72 && f <= 144));
    assert.equal(
      frames.reduce((a, b) => a + b, 0),
      Math.ceil(duration * 24),
    );
  }
  assert.throws(() => shotFrames(NaN));
});
test("automatic storyboard excludes unrelated portraits and uses linked document excerpts", () => {
  const story = fixture();
  story.assets = [asset("T", "Richard Teng")];
  story.segments[0].assetId = "T";
  const scenes: NarratedScene[] = [
    {
      segmentId: "N",
      text: story.segments[0].text,
      claimIds: ["C"],
      sourceIds: ["S"],
      start: 0,
      end: 40,
      narrationDuration: 40,
      narrationReused: false,
    },
  ];
  const shots = planShots(story, scenes, 40);
  assert(shots.every((s) => s.assetId !== "T"));
  assert(
    shots.some(
      (s) => s.kind === "document" && s.visual?.evidence[0].sourceId === "S",
    ),
  );
  assert.throws(
    () =>
      validateShotOverrides(story, [
        {
          id: "shot-01",
          segmentId: "N",
          kind: "media",
          assetId: "T",
          framing: "portrait",
        },
      ]),
    /subject named/,
  );
  story.segments[0].text = "Richard Teng spoke at the event.";
  scenes[0].text = story.segments[0].text;
  assert(planShots(story, scenes, 40).some((s) => s.assetId === "T"));
  story.shotOverrides = [
    {
      id: "shot-01",
      segmentId: "N",
      kind: "media",
      assetId: "T",
      framing: "portrait",
    },
  ];
  story.assets[0].discovery = {
    provider: "wikimedia",
    pageId: 1,
    title: "Richard Teng",
    sourceUrl: "https://example.org",
    licenseUrl: "https://example.org",
    downloadUrl: "https://example.org",
    hash: "h",
    retrievedAt: now(),
    changes: "Resized",
    reviewed: false,
  };
  assert(gates(story).some((g) => g.code === "media-review"));
  assert(!previewGates(story).some((g) => g.code === "media-review"));
});
test("speech captions retain every recognized word in at most two lines and honor pauses", () => {
  const words =
    "The agency announced a programme. Researchers will review the next phase of work before the next announcement."
      .split(" ")
      .map((text, i) => ({
        text,
        start: i * 500 + (i > 5 ? 700 : 0),
        end: i * 500 + 400 + (i > 5 ? 700 : 0),
      }));
  const cues = captionCues(words);
  assert(cues.every((c) => c.split("\n").length <= 3));
  assert.equal(
    cues.flatMap((c) => c.split("\n").slice(1)).join(" "),
    words.map((w) => w.text).join(" "),
  );
  assert(
    cues.every((c) =>
      c
        .split("\n")
        .slice(1)
        .every((l) => l.length <= 27),
    ),
  );
  assert(cues.some((c) => c.includes("00:00:03.700")));
});
test("narration cache distinguishes voice, text and pronunciation while ignoring visual-only edits", () => {
  const story = fixture(),
    saved = process.env.GEMINI_VOICE;
  try {
    process.env.GEMINI_VOICE = "Kore";
    const key = narrationKey(story, "Test speech", "gemini");
    story.title = "Changed headline";
    story.version++;
    assert.equal(narrationKey(story, "Test speech", "gemini"), key);
    assert.notEqual(narrationKey(story, "Changed speech", "gemini"), key);
    process.env.GEMINI_VOICE = "Puck";
    assert.notEqual(narrationKey(story, "Test speech", "gemini"), key);
    process.env.GEMINI_VOICE = "Kore";
    story.pronunciations = { Test: "Tehst" };
    assert.notEqual(narrationKey(story, "Test speech", "gemini"), key);
  } finally {
    if (saved === undefined) delete process.env.GEMINI_VOICE;
    else process.env.GEMINI_VOICE = saved;
  }
});
test("cache rejects corrupted media and stores only complete hashed outputs", async () => {
  const key = digest(crypto.randomUUID()),
    file = cachePath("test", key, "wav");
  try {
    await cacheBytes("test", key, "wav", Buffer.from("Complete audio"));
    assert.equal(
      (await cachedBytes("test", key, "wav"))?.toString(),
      "Complete audio",
    );
    await writeFile(file, "Corruption");
    assert.equal(await cachedBytes("test", key, "wav"), undefined);
    assert.throws(() => cachePath("../outside", key, "wav"));
  } finally {
    await rm(file, { force: true });
    await rm(file + ".json", { force: true });
  }
});
test("shot overlay preserves credits and context without repeating the headline", () => {
  const story = fixture();
  story.assets = [asset("T", "Richard Teng")];
  const shot = {
    id: "shot-01",
    segmentId: "N",
    kind: "media" as const,
    assetId: "T",
    framing: "portrait" as const,
    start: 0,
    end: 4.5,
    label: "Richard Teng",
    credit: "<Creator> & Agency",
  };
  const overlay = shotOverlay(story, shot, true);
  assert(!overlay.includes(story.title));
  assert(overlay.includes("Richard Teng · ARCHIVE"));
  assert(overlay.includes("&lt;Creator&gt; &amp; Agency"));
  assert(overlay.includes("PRIVATE PREVIEW"));
  assert(openingHeadline(story).includes(story.title));
});

test("original explainer graphics keep their identity and stay with their recorded narration", () => {
  const story = fixture();
  const graphic = {
    ...asset("graphic"),
    graphic: true,
    graphicNarration: ["Officials reconcile ballot and voter totals"],
    location: "United States",
    archive: false,
    context: "Original source-linked canvass explainer",
  };
  story.assets = [graphic];
  assert(
    assetMatchesNarration(
      graphic,
      "Officials reconcile ballot and voter totals during the canvass.",
    ),
  );
  assert(
    !assetMatchesNarration(
      graphic,
      "A projected winner on television is not an official result.",
    ),
  );
  const overlay = shotOverlay(
    story,
    {
      id: "shot-01",
      segmentId: "N",
      kind: "media",
      assetId: graphic.id,
      framing: "contain",
      start: 0,
      end: 6,
      label: "Canvass",
      credit: "World News",
    },
    true,
  );
  assert(overlay.includes("ORIGINAL EXPLAINER"));
  assert(!overlay.includes("SOURCE PHOTO") && !overlay.includes("ARCHIVE"));
});

test("portrait explainer graphics preserve the full canvas rather than photo framing", async () => {
  const story = fixture();
  const file = `assets/graphic-test-${crypto.randomUUID()}.png`;
  await mkdir(path.join(dataDir, "assets"), { recursive: true });
  await sharp({
    create: { width: 1080, height: 1920, channels: 3, background: "#ff0000" },
  })
    .png()
    .toFile(path.join(dataDir, file));
  story.assets = [{ ...asset("graphic"), file, graphic: true }];
  try {
    const png = await shotMaterial(story, {
      id: "shot-01",
      segmentId: "N",
      kind: "media",
      assetId: "graphic",
      framing: "portrait",
      start: 0,
      end: 6,
      label: "Graphic",
      credit: "World News",
    });
    assert(png);
    const { data, info } = await sharp(png)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 1080);
    assert.equal(info.height, 1920);
    assert.deepEqual([...data.subarray(0, 3)], [255, 0, 0]);
  } finally {
    await rm(path.join(dataDir, file), { force: true });
  }
});
