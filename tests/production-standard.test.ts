import test from "node:test";
import { stubQualityReport } from "./fixtures/quality-report.js";
import assert from "node:assert/strict";
import { newStory, gates, now } from "../server/domain.js";
import { PRODUCTION_STANDARD } from "../shared/production.js";
import type { Asset, Render, RenderedShot } from "../shared/types.js";
import {
  assertNarrationDuration,
  productionRecord,
  productionIssues,
  sourcePageUrl,
  usedReportingSources,
  usedVisualAssets,
} from "../server/production-record.js";
import { sourceCardSvg } from "../server/source-cards.js";
import { sourcePage } from "../server/source-page.js";
import { renderStory } from "../server/media.js";

function fixture() {
  const story = newStory("A documented announcement");
  story.eventAt = "2026-11-01";
  story.sources = Array.from({ length: 8 }, (_, i) => ({
    id: `S${i}`,
    url: `https://agency.example/document-${i}`,
    title: `Document ${i}`,
    publisher: i < 2 ? "Same publisher" : `Publisher ${i}`,
    author: "Press office",
    publishedAt: "2026-11-01",
    retrievedAt: now(),
    hash: `hash-${i}`,
    text: `The agency published document ${i}.`,
    language: "en",
    lineage: `lineage-${i}`,
    kind: "primary" as const,
    usage: "Test fixture",
  }));
  story.claims = story.sources.map((s, i) => ({
    id: `C${i}`,
    text: s.text,
    reviewed: true,
    status: "attributed statement" as const,
    evidence: [
      { sourceId: s.id, passage: s.text, relation: "supports" as const },
    ],
  }));
  story.segments = [
    {
      id: "N1",
      text: Array(70).fill("announcement").join(" "),
      claimIds: ["C0", "C1", "C2", "C3"],
    },
    {
      id: "N2",
      text: Array(70).fill("document").join(" "),
      claimIds: ["C4", "C5", "C6"],
    },
  ];
  return story;
}

function asset(id: string): Asset {
  return {
    id,
    file: `${id}.png`,
    creator: `Creator ${id}`,
    permission: "CC BY 4.0",
    provenance: "https://agency.example/photo",
    eventDate: "2026-11-01",
    location: "Test location",
    archive: false,
    context: `Verified context ${id}`,
  };
}

function shot(assetId: string): RenderedShot {
  return {
    id: "shot-01",
    segmentId: "N1",
    kind: "media",
    assetId,
    framing: "contain",
    start: 0,
    end: 5,
    label: assetId,
    credit: `Creator ${assetId}`,
  };
}

function render(story = fixture()): Render {
  const production = productionRecord(story, 70, 70, []);
  return {
    version: story.version,
    duration: production.sourceCards.at(-1)!.end,
    production,
    shots: [],
    card: "card.png",
    story: "story.png",
    video: "video.mp4",
    captions: "captions.vtt",
    manifest: "manifest.json",
    voice: "local",
    createdAt: now(),
  };
}

test("speech minimum excludes credits and holds short or nonfinite narration", () => {
  for (const seconds of [0, 20, 59.999, 90.001, NaN, Infinity])
    assert.throws(() => assertNarrationDuration(seconds), /substantive speech/);
  assert.doesNotThrow(() => assertNarrationDuration(60));
  assert.doesNotThrow(() => assertNarrationDuration(90));
  assert.throws(
    () => productionRecord(fixture(), 45, 70),
    /substantive speech/,
  );
  assert.throws(() => productionRecord(fixture(), 60, 65), /timing/);
});

test("legacy brief format cannot bypass the minimum, even in direct renderer calls", async () => {
  const story = fixture();
  story.format = "brief";
  story.segments[0].text = "A short statement.";
  story.segments[1].text = "Another short statement.";
  assert(gates(story).some((g) => g.code === "length"));
  await assert.rejects(() => renderStory(story, async () => {}), /140–205/);
});

test("closing sources cover the entire story, retain different documents from one publisher and paginate without omissions", () => {
  const story = fixture();
  const p = productionRecord(story, 70, 70);
  assert.deepEqual(p.sourceIds, ["S0", "S1", "S2", "S3", "S4", "S5", "S6"]);
  assert.deepEqual(
    p.sourceCards.map((c) => c.sourceIds.length),
    [3, 3, 1],
  );
  assert.deepEqual(
    p.sourceCards.flatMap((c) => c.sourceIds),
    p.sourceIds,
  );
  assert.equal(p.sourceCards[0].start, 70);
  assert.equal(p.sourceCards.at(-1)!.end, 94);
  assert(
    p.sourceCards.every(
      (c, i) =>
        c.end - c.start === 8 && (!i || c.start === p.sourceCards[i - 1].end),
    ),
  );
  assert.equal(usedReportingSources(story, "N2").length, 3);
  const svg = sourceCardSvg(story, p, p.sourceCards[0], true);
  assert(svg.includes("Document 0") && svg.includes("Document 1"));
  assert(!svg.includes("Document 7"));
  const html = sourcePage(story, true);
  assert(html.includes("Reporting sources used"));
  assert(html.indexOf("Document 7") > html.indexOf("Other research sources"));
});

test("closing source artwork escapes metadata and displays the exact revision address", () => {
  const story = fixture();
  story.sources[0].publisher = '<script>"Agency" & Co</script>';
  const p = productionRecord(story, 70, 70);
  const svg = sourceCardSvg(story, p, p.sourceCards[0], true);
  assert(!svg.includes("<script>"));
  assert(svg.includes("&lt;script&gt;"));
  assert(svg.includes(`?v=${story.version}`));
  assert(svg.includes("PRIVATE PREVIEW"));
  assert.equal(p.sourcePage, sourcePageUrl(story));
});

test("source-credit limits stop production rather than dropping reporting references", () => {
  const story = fixture();
  story.sources = Array.from({ length: 20 }, (_, i) => ({
    ...story.sources[0],
    id: `S${i}`,
    title: `Document ${i}`,
  }));
  story.claims = story.sources.map((s, i) => ({
    ...story.claims[0],
    id: `C${i}`,
    evidence: [{ sourceId: s.id, passage: s.text, relation: "supports" }],
  }));
  story.segments[0].claimIds = story.claims.map((c) => c.id);
  assert.throws(
    () => productionRecord(story, 70, 70),
    /without omitting citations/,
  );
});

test("approval gates reject legacy exports, missing citations, premature credits and incomplete final files", () => {
  const story = fixture();
  const r = render(story);
  story.renders = [r];
  stubQualityReport(story, r);
  assert.deepEqual(gates(story), []);
  for (const damage of [
    (r: Render) => {
      delete r.production;
    },
    (r: Render) => {
      r.production!.sourceCards.pop();
    },
    (r: Render) => {
      r.production!.sourceIds.pop();
    },
    (r: Render) => {
      r.production!.sourceCards[0].start = 65;
    },
    (r: Render) => {
      r.duration = 70;
    },
    (r: Render) => {
      r.production!.narrationDuration = 40;
    },
    (r: Render) => {
      r.production!.sourcePage += "0";
    },
    (r: Render) => {
      r.production!.assetIds.push("uncredited-visual");
    },
  ]) {
    const broken = structuredClone(r);
    damage(broken);
    assert(productionIssues(story, broken).length);
    assert(
      gates({ ...story, renders: [broken] }).some(
        (g) => g.code === "production-contract",
      ),
    );
  }
  assert.equal(r.production!.standard, PRODUCTION_STANDARD.version);
});

test("source pages include timeline-only assets, exclude unused assets and ignore stale render timelines", () => {
  const story = fixture();
  story.assets = [asset("segment"), asset("timeline"), asset("unused")];
  story.segments[0].assetId = "segment";
  const r = render(story);
  r.shots = [shot("timeline")];
  r.production = productionRecord(story, 70, 70, r.shots);
  story.renders = [r];
  assert.deepEqual(
    usedVisualAssets(story).map((a) => a.id),
    ["segment", "timeline"],
  );
  assert.deepEqual(r.production.assetIds, ["segment", "timeline"]);
  const html = sourcePage(story, true);
  assert(html.includes("Creator timeline") && html.includes("Creator segment"));
  assert(!html.includes("Creator unused"));
  r.version--;
  assert.deepEqual(
    usedVisualAssets(story).map((a) => a.id),
    ["segment"],
  );
});

test("a short saved draft cannot be recovered through the old draft-application route", async () => {
  const { Store } = await import("../server/db.js");
  const { createApp } = await import("../server/app.js");
  const store = new Store(undefined, ":memory:");
  await store.init();
  const story = fixture();
  await store.create(story);
  await store.addReport({
    id: "old-brief",
    storyId: story.id,
    version: story.version,
    kind: "draft",
    createdAt: now(),
    data: {
      outcome: "draft",
      reason: "Old brief",
      summary: "Old saved brief",
      claims: story.claims,
      segments: [
        {
          id: "short",
          text: Array(119).fill("agency").join(" "),
          claimIds: ["C0"],
        },
      ],
    },
  });
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  try {
    const port = (server.address() as { port: number }).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/api/stories/${story.id}/ai-reports/old-brief/apply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: story.version }),
      },
    );
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /140–205/);
    assert.equal((await store.get(story.id))!.version, story.version);
    assert.equal((await store.costs()).length, 0);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await store.close();
  }
});
