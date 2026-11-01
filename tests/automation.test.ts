import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/db.js";
import {
  newStory,
  id,
  now,
  gates,
  previewGates,
  wordCount,
} from "../server/domain.js";
import {
  namesSource,
  automaticScript,
  prepareAutomaticVideo,
  queueAutomaticVideo,
  scheduleAutomaticVideos,
} from "../server/automation.js";
import { createApp } from "../server/app.js";
import type { Story } from "../shared/types.js";
process.env.MEDIA_DISCOVERY_ENABLED = "false";

function fixture(): Story {
  const story = newStory("Agency programme update");
  story.sources = ["Research desk", "Independent reporter"].map(
    (publisher, i) => ({
      id: `S${i}`,
      publisher,
      url: `https://source${i}.example/news`,
      title: "Original report",
      author: "Reporter",
      publishedAt: "2026-10-30",
      retrievedAt: now(),
      text: "The agency announced a programme. The centre will review its timetable.",
      hash: `hash${i}`,
      kind: "secondary",
      language: "en",
      lineage: publisher,
      usage: "Fixture",
      research: {
        runId: "fixture",
        assessment: "Provisional",
        metadataReviewed: false,
      },
    }),
  );
  story.claims = [
    "The agency announced a new programme that will involve researchers working at its science centre and reviewing the timetable for the next phase of the work.",
    "The centre will review its timetable before it proceeds with the next stage of the announced programme, according to reporting from the two separate publications.",
  ].map((text) => ({
    id: id(),
    text,
    status: "supported fact",
    reviewed: false,
    evidence: story.sources.map((s) => ({
      sourceId: s.id,
      passage: s.text,
      relation: "supports",
    })),
  }));
  return story;
}

test("automatic narration uses eligible findings without approving claims or source metadata", () => {
  const story = fixture();
  story.claims.push({
    ...story.claims[0],
    id: "unresolved",
    text: "A disputed allegation that must not appear in the video.",
    status: "disputed",
  });
  story.approval = {
    version: 1,
    editor: "Previous",
    at: now(),
    destinations: ["export"],
  };
  const next = automaticScript(story);
  assert.equal(next.format, "brief");
  assert(wordCount(next) >= 60 && wordCount(next) < 140);
  assert.equal(next.segments.length, 2);
  assert(!next.segments.some((s) => s.claimIds.includes("unresolved")));
  assert.equal(next.approval, undefined);
  assert(next.claims.every((c) => !c.reviewed));
  assert(next.sources.every((s) => !s.research?.metadataReviewed));
  assert.equal(next.eventAt, "");
  assert.deepEqual(previewGates(next), []);
  assert(gates(next).some((g) => g.code === "date"));
  assert(gates(next).some((g) => g.code === "provenance"));
  assert(next.automation!.warnings.some((w) => w.includes("1 claim")));
});

test("automatic production holds fabricated evidence, shared lineages and unsupported-only stories", () => {
  const fake = fixture();
  fake.claims.forEach((c) =>
    c.evidence.forEach((e) => (e.passage = "Invented evidence")),
  );
  assert.throws(() => automaticScript(fake), /No claims pass/);
  const shared = fixture();
  shared.sources.forEach((s) => (s.lineage = "Shared wire report"));
  assert.throws(() => automaticScript(shared), /No claims pass/);
  const disputed = fixture();
  disputed.claims.forEach((c) => (c.status = "disputed"));
  assert.throws(() => automaticScript(disputed), /No claims pass/);
  const short = fixture();
  short.claims = [
    { ...short.claims[0], text: "The agency announced a programme." },
  ];
  assert.throws(() => automaticScript(short), /will not pad/);
  const invalidDate = fixture();
  invalidDate.eventAt = "invalid";
  assert.throws(() => automaticScript(invalidDate), /event date/);
});

test("durable automatic production waits for research and schedules each checkpoint once without API spending", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  try {
    const story = fixture();
    await store.create(story);
    await queueAutomaticVideo(store, story);
    const research = {
      id: id(),
      storyId: story.id,
      version: 1,
      revision: 0,
      status: "queued" as const,
      progress: "Research queued",
      createdAt: now(),
      lease: 0,
      queries: [],
      candidates: [],
      warnings: [],
    };
    await store.addResearch(research);
    await scheduleAutomaticVideos(store);
    assert.equal((await store.jobs()).length, 0);
    await store.updateResearch({ ...research, status: "succeeded" });
    await scheduleAutomaticVideos(store);
    await scheduleAutomaticVideos(store);
    const prepare = (await store.jobs())[0];
    assert.equal((await store.jobs()).length, 1);
    assert.equal(prepare.kind, "prepare");
    await store.claimJob(prepare.id);
    await prepareAutomaticVideo(store, (await store.get(story.id))!);
    await store.updateJob({ ...prepare, status: "succeeded" });
    await scheduleAutomaticVideos(store);
    await scheduleAutomaticVideos(store);
    const jobs = await store.jobs();
    assert.equal(jobs.length, 2);
    const render = jobs.find((j) => j.kind === "render")!;
    assert.equal(render.version, 2);
    assert.equal(render.privatePreview, true);
    assert.equal((await store.budget()).reservedUsd, 0);
    const latest = (await store.get(story.id))!;
    assert.equal(latest.automation?.state, "rendering");
    assert((await store.reports(story.id)).some((r) => r.kind === "draft"));
    const stale = structuredClone(latest);
    stale.version = 1;
    await assert.rejects(() => prepareAutomaticVideo(store, stale), /changed/);
  } finally {
    await store.close();
  }
});

test("failed automatic production stops until an explicit continuation", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  try {
    const story = fixture();
    await store.create(story);
    await queueAutomaticVideo(store, story);
    await scheduleAutomaticVideos(store);
    const job = (await store.jobs())[0];
    await store.updateJob({ ...job, status: "failed", error: "Interrupted" });
    await scheduleAutomaticVideos(store);
    await scheduleAutomaticVideos(store);
    assert.equal((await store.jobs()).length, 1);
    assert.equal((await store.get(story.id))!.automation?.state, "blocked");
    await queueAutomaticVideo(store, (await store.get(story.id))!);
    await scheduleAutomaticVideos(store);
    assert.equal((await store.get(story.id))!.version, 2);
    assert.equal(
      (await store.jobs()).filter((j) => j.status === "queued").length,
      1,
    );
  } finally {
    await store.close();
  }
});

test("a private automatic render cannot be approved even after editorial checks are clear", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  const story = automaticScript(fixture());
  story.eventAt = "2026-10-30T00:00:00Z";
  story.claims.forEach((c) => (c.reviewed = true));
  story.sources.forEach((s) => (s.research!.metadataReviewed = true));
  story.renders = [
    {
      version: story.version,
      video: "v.mp4",
      card: "c.png",
      story: "s.png",
      captions: "c.vtt",
      manifest: "m.json",
      duration: 35,
      createdAt: now(),
      voice: "local",
      privatePreview: true,
    },
  ];
  assert.deepEqual(gates(story), []);
  await store.create(story);
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/api/stories/${story.id}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: story.version,
          editor: "Editor",
          destinations: ["Instagram"],
          previewChecked: true,
        }),
      },
    );
    assert.equal(response.status, 422);
    assert.match((await response.json()).error, /automatic preview/);
    assert.equal((await store.get(story.id))!.approval, undefined);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close();
  }
});

test("automatic narration lets a self-attributed primary statement speak for itself", () => {
  assert.ok(
    namesSource("The FBI said it observed…", "Federal Bureau of Investigation"),
  );
  assert.ok(
    namesSource(
      "The Federal Bureau of Investigation said…",
      "Federal Bureau of Investigation",
    ),
  );
  assert.ok(
    !namesSource(
      "North Korea was responsible.",
      "Federal Bureau of Investigation",
    ),
  );
  assert.ok(
    !namesSource("The FBIS archive…", "Federal Bureau of Investigation"),
  );
  const story = fixture();
  story.sources[0] = {
    ...story.sources[0],
    publisher: "Federal Bureau of Investigation",
    kind: "primary",
  };
  const named =
    "The FBI said the agency announced a new programme that will involve researchers working at its science centre and reviewing the timetable for the next phase of the work.";
  const unnamed =
    "The agency announced that the centre will review its timetable before it proceeds with the next stage of the announced programme, as described in its statement.";
  story.claims = [named, unnamed].map((text) => ({
    id: id(),
    text,
    status: "attributed statement",
    reviewed: false,
    evidence: [
      { sourceId: "S0", passage: story.sources[0].text, relation: "supports" },
    ],
  }));
  const texts = automaticScript(story).segments.map((s) => s.text);
  assert.equal(texts[0], named);
  assert.equal(
    texts[1],
    `According to Federal Bureau of Investigation, ${unnamed}`,
  );
});
