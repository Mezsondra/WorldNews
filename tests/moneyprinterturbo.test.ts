import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/db.js";
import { createApp } from "../server/app.js";
import { newStory, now } from "../server/domain.js";
import {
  sameNarration,
  renderStory,
  narrationCharacters,
} from "../server/media.js";
import { scheduleAutomaticVideos } from "../server/automation.js";
import { cuesToSrt, moneyPrinterOverlay } from "../server/moneyprinterturbo.js";

function fixture() {
  const story = newStory("Agency science programme");
  story.format = "brief";
  story.stage = "awaiting-review";
  story.eventAt = "2026-10-30";
  const passage = "The agency announced a new science programme.";
  story.sources = [
    {
      id: "S",
      url: "https://agency.example/report",
      title: story.title,
      publisher: "Agency",
      author: "Reporter",
      publishedAt: story.eventAt,
      retrievedAt: now(),
      hash: "h",
      text: passage,
      language: "en",
      lineage: "Agency",
      kind: "primary",
      usage: "Fixture",
    },
  ];
  story.claims = [
    {
      id: "C",
      text: passage,
      status: "attributed statement",
      reviewed: false,
      evidence: [{ sourceId: "S", passage, relation: "supports" }],
    },
  ];
  story.segments = [
    { id: "N", text: Array(22).fill(passage).join(" "), claimIds: ["C"] },
  ];
  story.renders = [
    {
      version: 1,
      card: "renders/old/card.png",
      story: "renders/old/story.png",
      video: "renders/old/video.mp4",
      captions: "renders/old/captions.vtt",
      manifest: "renders/old/manifest.json",
      duration: 30,
      createdAt: now(),
      voice: "Local development voice",
      privatePreview: true,
    },
  ];
  return story;
}

test("narration cache rejects text and pronunciation changes but accepts a renderer-only revision", () => {
  const before = fixture(),
    after = structuredClone(before);
  after.version++;
  after.videoRenderer = "moneyprinterturbo";
  assert(sameNarration(before, after));
  after.segments[0].text += " A correction.";
  assert(!sameNarration(before, after));
  after.segments = structuredClone(before.segments);
  after.pronunciations = { Agency: "ay gen see" };
  assert(!sameNarration(before, after));
  before.pronunciations = { Zulu: "zoo loo", Alpha: "al fa" };
  after.pronunciations = { Alpha: "al fa", Zulu: "zoo loo" };
  assert(sameNarration(before, after));
});
test("MPT subtitle conversion preserves cue boundaries and timestamp-like caption text", () => {
  const srt = cuesToSrt([
    "00:00:01.250 --> 00:00:03.750\nVersion 2.000: 12:30:00.000 remains text.",
    "00:00:04.000 --> 00:00:05.500\nSecond cue",
  ]);
  assert.match(srt, /1\n00:00:01,250 --> 00:00:03,750/);
  assert.match(srt, /Version 2.000: 12:30:00.000 remains text/);
  assert.match(srt, /2\n00:00:04,000 --> 00:00:05,500/);
});
test("media overlay escapes source credits and retains archive identity and private-review labeling", () => {
  const story = fixture();
  story.title = 'A <headline> & "quote"';
  const svg = moneyPrinterOverlay(
    story,
    0,
    {
      id: "A",
      file: "a.png",
      creator: "<script>Example</script>",
      permission: "CC BY 4.0",
      provenance: "https://source.example",
      eventDate: "2023-11-09",
      location: "Istanbul",
      archive: true,
      subject: "Richard Teng",
      context: "Archive portrait",
    },
    true,
  );
  assert(!svg.includes("<script>"));
  assert.match(svg, /&lt;script&gt;Example/);
  assert.match(svg, /Richard Teng · ARCHIVE/);
  assert.match(svg, /PRIVATE PREVIEW/);
  assert.match(svg, /2023-11-09/);
});
test("renderer comparison queues a new private revision while keeping previous exports and editorial gates", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  const story = fixture();
  await store.create(story);
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const request = (body: unknown) =>
    fetch(`http://127.0.0.1:${port}/api/stories/${story.id}/renderer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await request({ version: 1, renderer: "unknown" })).status,
      400,
    );
    const response = await request({ version: 1, renderer: "classic" });
    assert.equal(response.status, 202);
    const job = await response.json();
    assert.equal(job.privatePreview, true);
    assert.equal(job.tts, "local");
    assert.equal(job.version, 2);
    assert.equal(job.kind, "render");
    const next = (await store.get(story.id))!;
    assert.equal(next.videoRenderer, "classic");
    assert.equal(next.renders[0].video, story.renders[0].video);
    assert.equal(next.approval, undefined);
    assert(next.claims.every((c) => !c.reviewed));
    assert.deepEqual(next.sources, story.sources);
    assert.equal(
      (await request({ version: 1, renderer: "classic" })).status,
      409,
    );
    assert.equal(
      (await request({ version: 2, renderer: "classic" })).status,
      409,
    );
    await store.cancelJobs(story.id);
    next.stage = "approved";
    await store.save(next, next.version);
    assert.equal(
      (await request({ version: 2, renderer: "classic" })).status,
      422,
    );
    const overview = await (
      await fetch(`http://127.0.0.1:${port}/api/overview`)
    ).json();
    assert.equal(
      typeof overview.renderers.moneyprinterturbo.available,
      "boolean",
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close();
  }
});

test("Gemini preview selection requires a configured allowance and captures one explicit revision", async () => {
  const names = [
    "PILOT_API_ENABLED",
    "GEMINI_API_KEY",
    "PILOT_BUDGET_USD",
    "MAX_PAID_CHARACTERS_PER_RENDER",
  ];
  const saved = names.map((name) => process.env[name]);
  process.env.PILOT_API_ENABLED = "false";
  process.env.GEMINI_API_KEY = "test-key-not-sent";
  process.env.PILOT_BUDGET_USD = "5";
  process.env.MAX_PAID_CHARACTERS_PER_RENDER = "1500";
  const store = new Store(undefined, ":memory:");
  await store.init();
  const story = fixture();
  await store.create(story);
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const request = () =>
    fetch(`http://127.0.0.1:${port}/api/stories/${story.id}/renderer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, renderer: "classic", tts: "gemini" }),
    });
  try {
    assert.equal((await request()).status, 422);
    assert.equal((await store.get(story.id))!.version, 1);
    process.env.PILOT_API_ENABLED = "true";
    process.env.MAX_PAID_CHARACTERS_PER_RENDER = "10";
    assert.equal((await request()).status, 422);
    assert.equal((await store.get(story.id))!.version, 1);
    process.env.MAX_PAID_CHARACTERS_PER_RENDER = "1500";
    delete process.env.GEMINI_API_KEY;
    assert.equal((await request()).status, 422);
    process.env.GEMINI_API_KEY = "test-key-not-sent";
    const response = await request();
    assert.equal(response.status, 202);
    const job = await response.json();
    assert.equal(job.tts, "gemini");
    assert.equal(job.privatePreview, true);
    let next = (await store.get(story.id))!;
    assert.equal(next.narrationProvider, "gemini");
    assert.deepEqual(next.automation?.previewNarration, {
      version: 2,
      provider: "gemini",
    });
    assert.equal((await store.costs()).length, 0); // Queueing never calls the provider.
    await store.cancelJobs(story.id);
    await scheduleAutomaticVideos(store); // Recovery preserves the explicit voice.
    assert.equal(
      (await store.jobs()).find((j) => j.status === "queued")?.tts,
      "gemini",
    );
    await store.cancelJobs(story.id);
    next = (await store.get(story.id))!;
    next.version++;
    await store.save(next, 2);
    await scheduleAutomaticVideos(store); // A later automatic revision is free.
    assert.equal(
      (await store.jobs()).find((j) => j.status === "queued")?.tts,
      "local",
    );
    await assert.rejects(
      () =>
        renderStory(next, async () => {}, store, {
          privatePreview: true,
          captions: "estimated",
        }),
      /explicit Gemini selection/,
    );
    assert.equal((await store.costs()).length, 0);
    const limited = fixture();
    await store.create(limited);
    await store.reserveCost({
      id: "budget-fixture",
      operationKey: "budget-fixture",
      storyId: limited.id,
      provider: "fixture",
      operation: "allowance",
      reservedUsd: 4.5,
      state: "reserved",
      createdAt: now(),
    });
    const blocked = await fetch(
      `http://127.0.0.1:${port}/api/stories/${limited.id}/renderer`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: 1,
          renderer: "classic",
          tts: "gemini",
        }),
      },
    );
    assert.equal(blocked.status, 422);
    assert.match((await blocked.json()).error, /available pilot allowance/);
    assert.equal((await store.get(limited.id))!.version, 1);
    next.pronunciations = { agency: "a much longer pronunciation" };
    assert(
      narrationCharacters(next) >
        next.segments.reduce((n, s) => n + s.text.length, 0),
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close();
    names.forEach((name, i) =>
      saved[i] === undefined
        ? delete process.env[name]
        : (process.env[name] = saved[i]),
    );
  }
});
test("comparison endpoint rejects broken evidence before mutating the story", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  const story = fixture();
  story.claims[0].evidence[0].passage = "Fabricated evidence";
  await store.create(story);
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/api/stories/${story.id}/renderer`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 1, renderer: "classic" }),
      },
    );
    assert.equal(response.status, 422);
    assert.equal((await store.get(story.id))?.version, 1);
    assert.equal((await store.jobs()).length, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close();
  }
});

test("aligned private captions require explicit configuration and only carry to the authorized revision", async () => {
  const names = ["PILOT_API_ENABLED", "ASSEMBLYAI_API_KEY", "PILOT_BUDGET_USD"],
    saved = names.map((n) => process.env[n]);
  process.env.PILOT_API_ENABLED = "false";
  process.env.ASSEMBLYAI_API_KEY = "test-key-not-sent";
  process.env.PILOT_BUDGET_USD = "5";
  const store = new Store(undefined, ":memory:");
  await store.init();
  const story = fixture();
  await store.create(story);
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const request = () =>
    fetch(`http://127.0.0.1:${port}/api/stories/${story.id}/renderer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 1,
        renderer: "classic",
        tts: "local",
        captions: "assemblyai",
      }),
    });
  try {
    assert.equal((await request()).status, 422);
    assert.equal((await store.get(story.id))!.version, 1);
    process.env.PILOT_API_ENABLED = "true";
    delete process.env.ASSEMBLYAI_API_KEY;
    assert.equal((await request()).status, 422);
    process.env.ASSEMBLYAI_API_KEY = "test-key-not-sent";
    const response = await request();
    assert.equal(response.status, 202);
    const job = await response.json();
    assert.equal(job.captions, "assemblyai");
    assert.equal(job.privatePreview, true);
    let next = (await store.get(story.id))!;
    assert.equal(next.captionProvider, "assemblyai");
    assert.deepEqual(next.automation?.previewCaptions, {
      version: 2,
      provider: "assemblyai",
    });
    await store.cancelJobs(story.id);
    await scheduleAutomaticVideos(store);
    assert.equal(
      (await store.jobs()).find((j) => j.status === "queued")?.captions,
      "assemblyai",
    );
    await store.cancelJobs(story.id);
    next = (await store.get(story.id))!;
    next.version++;
    await store.save(next, 2);
    await scheduleAutomaticVideos(store);
    assert.equal(
      (await store.jobs()).find((j) => j.status === "queued")?.captions,
      "estimated",
    );
    assert.equal((await store.costs()).length, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close();
    names.forEach((name, i) =>
      saved[i] === undefined
        ? delete process.env[name]
        : (process.env[name] = saved[i]),
    );
  }
});
