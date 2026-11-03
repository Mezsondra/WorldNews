import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  planEvidenceVisuals,
  visualPlanIssues,
  visualCoverage,
  explicitDates,
  geography,
} from "../server/visual-plan.js";
import {
  planShots,
  validateShotOverrides,
  type NarratedScene,
} from "../server/editorial-plan.js";
import { evidenceGraphic } from "../server/visual-graphics.js";
import { captionAss } from "../server/native-video.js";
import { sourcePage } from "../server/source-page.js";
import type { Render, Story } from "../shared/types.js";
import { Store } from "../server/db.js";
import { createApp } from "../server/app.js";
import type { AddressInfo } from "node:net";

import { visualFixture } from "./fixtures/visual-story.js";

const scenes = (story: Story): NarratedScene[] =>
  story.segments.map((s, i) => ({
    segmentId: s.id,
    text: s.text,
    claimIds: s.claimIds,
    sourceIds: ["S"],
    start: i * 16,
    end: (i + 1) * 16,
    narrationDuration: 16,
    narrationReused: false,
  }));

test("automatic visual plans use exact saved passages and explicit narration-linked places and dates", () => {
  const story = visualFixture(),
    plan = planEvidenceVisuals(story);
  assert(plan.some((v) => v.kind === "document"));
  assert(
    plan.some((v) => v.kind === "map" && v.places[0].mention === "Poland"),
  );
  assert(
    plan.some((v) => v.kind === "map" && v.places[0].mention === "Germany"),
  );
  const timeline = plan.find((v) => v.kind === "timeline")!;
  assert.equal(timeline.kind, "timeline");
  if (timeline.kind === "timeline") {
    assert.deepEqual(
      timeline.items.map((i) => i.date),
      ["November 1, 2026", "December 1, 2026"],
    );
    assert(timeline.items[1].excerpt.includes("plans to publish"));
  }
  for (const v of plan)
    for (const ref of v.evidence)
      assert(story.sources[0].text.includes(ref.passage));
  const blank = visualFixture();
  blank.sources[0].text =
    "Different material, without an exact matching passage.";
  assert.deepEqual(planEvidenceVisuals(blank), []);
});

test("places must occur in narration and its own supporting evidence; dates are never inferred from publication", () => {
  const story = visualFixture();
  story.segments[0].text =
    "The fictional agency announces a monitoring programme in France.";
  assert(
    !planEvidenceVisuals(story).some(
      (v) => v.kind === "map" && v.segmentId === "N0",
    ),
  );
  assert(!planEvidenceVisuals(story).some((v) => v.kind === "timeline"));
  story.segments[0].text =
    "The fictional agency announces a monitoring programme.";
  story.region = "France";
  story.sources[0].publishedAt = "2030-10-12";
  assert(
    !planEvidenceVisuals(story).some(
      (v) => v.segmentId === "N0" && ["map", "timeline"].includes(v.kind),
    ),
  );
  story.claims[0].evidence[0].relation = "contradicts";
  assert(!planEvidenceVisuals(story).some((v) => v.segmentId === "N0"));
});

test("ambiguous names, invalid dates and date ranges do not invent places or distinct events", () => {
  assert.deepEqual(explicitDates("2026-02-30"), []);
  assert.deepEqual(explicitDates("31 February 2026"), []);
  assert.equal(
    explicitDates("1 November 2026")[0].order,
    explicitDates("2026-11-01")[0].order,
  );
  const story = visualFixture();
  const text =
    "Jordan and Georgia discussed measurements between 2024 and 2030.";
  story.sources[0].text = text;
  story.claims[0].evidence[0].passage = text;
  story.segments = [{ id: "N0", text, claimIds: ["C0"] }];
  assert(
    !planEvidenceVisuals(story).some(
      (v) => v.kind === "map" || v.kind === "timeline",
    ),
  );
});

test("non-English evidence needs a saved translation and remains labelled as translated", () => {
  const story = visualFixture();
  story.sources[0].language = "pl";
  assert.deepEqual(planEvidenceVisuals(story), []);
  story.claims[0].evidence[0].translation = story.claims[0].evidence[0].passage;
  const document = planEvidenceVisuals(story).find(
    (v) => v.kind === "document",
  )!;
  assert(document.kind === "document" && document.translated);
  assert(evidenceGraphic(story, document).includes("SAVED TRANSLATION"));
});

test("timed plans cover every frame, cut at segment boundaries and give dated context reading time", () => {
  const story = visualFixture();
  const shots = planShots(story, scenes(story), 64);
  assert.equal(shots[0].start, 0);
  assert.equal(shots.at(-1)!.end, 64);
  assert(
    shots.every(
      (s, i) => (!i || s.start === shots[i - 1].end) && s.end > s.start,
    ),
  );
  assert(shots.every((s) => s.end - s.start >= 3 && s.end - s.start <= 10));
  assert(shots.some((s) => s.kind === "timeline" && s.end - s.start >= 6));
  assert(
    shots.every(
      (s) =>
        s.start >= Number(s.segmentId.slice(1)) * 16 &&
        s.end <= (Number(s.segmentId.slice(1)) + 1) * 16,
    ),
  );
  assert.deepEqual(visualPlanIssues(story, shots), []);
  assert.equal(visualCoverage(shots, 64).percent, 100);
  assert.throws(
    () =>
      planShots(
        story,
        [{ ...scenes(story)[0], end: 2, narrationDuration: 2 }],
        2,
      ),
    /Combine short supported segments/,
  );
});

test("explanatory overrides select server-derived current visuals and reject forged or stale content", () => {
  const story = visualFixture();
  const map = planEvidenceVisuals(story).find((v) => v.kind === "map")!;
  const override = {
    id: "shot-01",
    segmentId: map.segmentId,
    kind: map.kind,
    visualId: map.id,
    framing: "contain" as const,
  };
  validateShotOverrides(story, [override]);
  assert.throws(
    () =>
      validateShotOverrides(story, [
        { ...override, visualId: "visual-0000000000000000" },
      ]),
    /supported/,
  );
  assert.throws(
    () => validateShotOverrides(story, [{ ...override, segmentId: "N3" }]),
    /supported/,
  );
  story.shotOverrides = [override];
  const shots = planShots(story, scenes(story), 64);
  const tampered = structuredClone(shots);
  const chosen = tampered[0].visual!;
  if (chosen.kind === "map") chosen.places[0].lon = 0;
  assert(visualPlanIssues(story, tampered).length);
  story.claims[0].evidence[0].passage =
    "This no longer matches the stored source text.";
  assert(visualPlanIssues(story, shots).length);
  assert.throws(() => validateShotOverrides(story, [override]), /supported/);
});

test("all graphic templates rasterize to portrait frames and escape source text", async () => {
  const story = visualFixture();
  story.sources[0].title = '<script>alert("source")</script> & report';
  const plan = planEvidenceVisuals(story);
  for (const kind of ["document", "map", "timeline"]) {
    const visual = plan.find((v) => v.kind === kind)!;
    const svg = evidenceGraphic(story, visual);
    assert(!svg.includes("<script>"));
    if (kind === "document") assert(svg.includes("&lt;script&gt;"));
    const meta = await sharp(Buffer.from(svg)).metadata();
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, 1920);
    assert((await sharp(Buffer.from(svg)).png().toBuffer()).length > 1000);
  }
});

test("source records preserve exact visual decisions and public-domain geography provenance", () => {
  const story = visualFixture();
  story.renders = [
    {
      version: story.version,
      shots: planShots(story, scenes(story), 64),
    } as Render,
  ];
  const html = sourcePage(story, true);
  assert(html.includes("Explanatory visual decisions"));
  assert(html.includes(geography.commit));
  assert(html.includes("Natural Earth · public domain"));
  assert(
    html.includes("no incident sites") || html.includes("not incident sites"),
  );
  assert(html.includes("plans to publish"));
});

test("coverage counts narration only and exposes full-text fallback and limited variety", () => {
  const story = visualFixture(),
    shots = planShots(story, scenes(story), 64);
  shots[0].kind = "fact";
  shots[0].visual = undefined;
  shots[0].visualId = undefined;
  const coverage = visualCoverage(shots, 60);
  assert.equal(coverage.narrationSeconds, 60);
  assert.equal(coverage.fullTextSeconds, 8);
  assert(coverage.percent < 90);
  assert(coverage.warnings.some((w) => w.includes("target at least 90%")));
  assert(
    visualCoverage([{ ...shots[0], start: 60, end: 68 }], 60)
      .purposefulSeconds === 0,
  );
});

test("caption styling has explicit portrait coordinates and source text cannot inject ASS overrides", () => {
  const result = captionAss([
    "00:00:01.234 --> 00:00:03.456\nThe agency says {\\an8}hello.\nNext line.",
  ]);
  assert(result.includes("PlayResY: 1920"));
  assert(result.includes("0:00:01.23,0:00:03.45"));
  assert(!result.includes("{\\an8}"));
  assert(result.includes("\\NNext line."));
});

test("HTTP visual overrides preserve the server-derived reference and queue the standard renderer", async () => {
  const story = visualFixture();
  const store = new Store(undefined, ":memory:");
  await store.init();
  await store.create(story);
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const visual = planEvidenceVisuals(story).find((v) => v.kind === "map")!;
    const override = {
      id: "shot-01",
      segmentId: visual.segmentId,
      kind: visual.kind,
      visualId: visual.id,
      framing: "contain",
    };
    const request = (value: unknown) =>
      fetch(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/stories/${story.id}/renderer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: 1,
            renderer: "classic",
            shotOverrides: [value],
          }),
        },
      );
    assert.equal(
      (await request({ ...override, visualId: "visual-0000000000000000" }))
        .status,
      422,
    );
    assert.equal((await store.get(story.id))!.version, 1);
    assert.equal((await request(override)).status, 202);
    const next = (await store.get(story.id))!;
    assert.equal(next.version, 2);
    assert.equal(next.shotOverrides![0].visualId, visual.id);
    const jobs = await store.jobs();
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].privatePreview, true);
    assert.equal(jobs[0].tts, "local");
    assert.equal((await store.costs()).length, 0);
    assert.equal(
      next.claims.every((c) => !c.reviewed),
      true,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close();
  }
});
