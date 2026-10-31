import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { get as httpGet } from "node:http";
import { Store } from "../server/db.js";
import { newStory, gates, invalidate, id, now } from "../server/domain.js";
import { createApp } from "../server/app.js";
import { isPublicAddress, validateUrl } from "../server/fetcher.js";
import { frame } from "../server/media.js";
import { sourcePage } from "../server/source-page.js";
import { startWorker } from "../server/worker.js";
import type { Story, Job } from "../shared/types.js";
function fixture(): Story {
  const story = newStory("An agency announces a reviewed science programme");
  story.eventAt = "2024-10-14T12:00:00Z";
  const passage = "The agency announced a new science programme.";
  story.sources = [
    {
      id: "S1",
      url: "https://example.org/announcement",
      title: "Original announcement",
      publisher: "Science Agency",
      author: "Press office",
      publishedAt: "2024-10-14",
      retrievedAt: now(),
      hash: createHash("sha256").update(passage).digest("hex"),
      text: passage,
      language: "en",
      lineage: "Science Agency",
      kind: "primary",
      usage: "Test fixture",
    },
  ];
  story.claims = [
    {
      id: "C1",
      text: "The agency announced a science programme.",
      status: "attributed statement",
      reviewed: true,
      evidence: [{ sourceId: "S1", passage, relation: "supports" }],
    },
  ];
  story.segments = [
    {
      id: "N1",
      claimIds: ["C1"],
      text: Array(15)
        .fill("The agency said it announced a new science programme today.")
        .join(" "),
    },
  ];
  return story;
}
test("eligible original announcements retain attribution and require editorial review", () => {
  const s = fixture();
  assert.deepEqual(gates(s), []);
  s.claims[0].reviewed = false;
  assert(gates(s).some((g) => g.code === "review"));
});
test("unsupported core claim is held even when the editor checks it", () => {
  const s = fixture();
  s.claims[0].status = "insufficient evidence";
  assert(gates(s).some((g) => g.code === "unsupported"));
});
test("several outlets sharing one lineage do not corroborate a fact", () => {
  const s = fixture();
  s.sources.push({
    ...s.sources[0],
    id: "S2",
    url: "https://another.example/report",
  });
  s.claims[0].status = "supported fact";
  s.claims[0].evidence.push({ ...s.claims[0].evidence[0], sourceId: "S2" });
  assert(gates(s).some((g) => g.code === "lineage"));
  s.sources[1].lineage = "Independent institute";
  assert(!gates(s).some((g) => g.code === "lineage"));
});
test("secondary report cannot be relabelled as an original attributed statement", () => {
  const s = fixture();
  s.sources[0].kind = "secondary";
  assert(gates(s).some((g) => g.code === "original"));
});
test("conflicting figures hold production", () => {
  const s = fixture();
  s.claims[0].evidence.push({
    ...s.claims[0].evidence[0],
    relation: "contradicts",
  });
  assert(gates(s).some((g) => g.code === "contradiction"));
});
test("a fabricated quotation fails exact passage matching", () => {
  const s = fixture();
  s.claims[0].evidence[0].passage = "A quotation not present in the source.";
  assert(gates(s).some((g) => g.code === "passage"));
});
test("missing translation requires reviewable original and English text", () => {
  const s = fixture();
  s.sources[0].language = "tr";
  assert(gates(s).some((g) => g.code === "translation"));
  s.claims[0].evidence[0].translation =
    "An English translation for editor review.";
  assert(!gates(s).some((g) => g.code === "translation"));
});
test("unrelated or unlicensed selected media with absent context is blocked", () => {
  const s = fixture();
  s.segments[0].assetId = "missing";
  assert(gates(s).some((g) => g.code === "rights"));
});
test("changed source snapshot makes stale evidence fail", () => {
  const s = fixture();
  s.sources[0].text = "The announcement has been withdrawn.";
  assert(gates(s).some((g) => g.code === "passage"));
});
test("missing source or broken segment citation cannot produce", () => {
  const s = fixture();
  s.sources = [];
  assert(gates(s).some((g) => g.code === "evidence"));
  s.segments[0].claimIds = ["unknown"];
  assert(gates(s).some((g) => g.code === "missing-claim"));
});
test("event date stays separate from retrieval time", () => {
  const s = fixture();
  s.eventAt = "";
  assert(gates(s).some((g) => g.code === "date"));
});
test("held and rejected stories need an explicit return to research", () => {
  for (const stage of ["held", "rejected"] as const) {
    const s = fixture();
    s.stage = stage;
    assert(gates(s).some((g) => g.code === "hold"));
  }
});
test("material edits invalidate exact-version approval and every claim review", () => {
  const s = fixture();
  s.approval = {
    version: 1,
    at: now(),
    editor: "Editor",
    destinations: ["Instagram"],
  };
  const next = invalidate(s);
  assert.equal(next.version, 2);
  assert.equal(next.approval, undefined);
  assert(next.claims.every((c) => !c.reviewed));
});
test("fetcher rejects private, link-local, mapped, reserved, and non-HTTP addresses", () => {
  for (const address of [
    "127.0.0.1",
    "0.0.0.0",
    "10.1.1.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "224.0.0.1",
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  for (const url of [
    "file:///etc/passwd",
    "http://localhost",
    "http://127.1/",
    "http://[::1]/",
    "https://user:pass@example.org",
    "http://example.org:8080",
  ])
    assert.throws(() => validateUrl(url), url);
});
test("source pages and SVG escape untrusted source content", () => {
  const s = fixture();
  s.title = "<script>alert(1)</script>";
  s.claims[0].evidence[0].passage = '<img onerror="bad">';
  assert(!sourcePage(s).includes("<script>"));
  assert(!frame(s, 0).includes("<script>"));
  assert(sourcePage(s).includes("&lt;script&gt;"));
});
test("SQLite persists work and approvals across restart; stale writes are rejected", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "worldnews-db-")),
    filename = path.join(dir, "db.sqlite");
  let store = new Store(undefined, filename);
  try {
    await store.init();
    const s = fixture();
    await store.create(s);
    await store.approveSnapshot({
      ...s,
      approval: {
        version: 1,
        at: now(),
        editor: "Test",
        destinations: ["Instagram"],
      },
    });
    const old = (await store.get(s.id))!;
    const second = (await store.get(s.id))!;
    old.stage = "held";
    await store.save(old, 1);
    second.stage = "approved";
    await assert.rejects(() => store.save(second, 1), /changed/);
    await store.close();
    store = new Store(undefined, filename);
    await store.init();
    assert.equal((await store.get(s.id))?.stage, "held");
    assert.equal((await store.approved(s.id))?.approval?.editor, "Test");
  } finally {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("render queue enforces uniqueness, locking, cancellation, and no blind crash retry", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  const job: Job = {
    id: id(),
    storyId: "story",
    version: 1,
    status: "queued",
    lease: 0,
    progress: "Queued",
    attempts: 0,
    createdAt: now(),
  };
  try {
    await store.addJob(job);
    await assert.rejects(() => store.addJob({ ...job, id: id() }));
    assert.equal(await store.claimJob(job.id), true);
    assert.equal(await store.claimJob(job.id), false);
    await store.cancelJobs("story");
    job.status = "succeeded";
    await store.updateJob(job);
    assert.equal((await store.jobs())[0].status, "cancelled");
    const crashed: Job = {
      ...job,
      id: id(),
      storyId: "crashed",
      status: "running",
      lease: Date.now() - 1,
    };
    await store.addJob(crashed);
    const stop = startWorker(store);
    await new Promise((resolve) => setTimeout(resolve, 75));
    stop();
    const recovered = (await store.jobs()).find((j) => j.id === crashed.id)!;
    assert.equal(recovered.status, "failed");
    assert.match(recovered.error!, /before manually retrying/);
  } finally {
    await store.close();
  }
});
test("HTTP workflow: guards, exact approval, public snapshot, edits, and corrections", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  const story = fixture();
  await store.create(story);
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const call = async (
    route: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, text: await response.text() };
  };
  try {
    assert.equal((await call(`/s/${story.id.slice(0, 8)}`)).status, 404);
    assert.equal(
      (
        await call(`/api/stories/${story.id}/approve`, "POST", {
          version: 1,
          editor: "Test",
          destinations: ["Instagram"],
          previewChecked: true,
        })
      ).status,
      422,
    );
    assert.equal(
      (
        await call(
          "/api/settings",
          "POST",
          { paused: false },
          { Origin: "https://attacker.example" },
        )
      ).status,
      403,
    );
    assert.equal((await call("/media/news.sqlite")).status, 404);
    const unknownHost = await new Promise<number | undefined>(
      (resolve, reject) => {
        httpGet(
          base + "/api/overview",
          { headers: { Host: "attacker.example" } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        ).on("error", reject);
      },
    );
    assert.equal(unknownHost, 403);
    const r = await call(`/api/stories/${story.id}/render`, "POST", {
      version: 1,
    });
    assert.equal(r.status, 202);
    assert.equal(
      JSON.parse(
        (await call(`/api/stories/${story.id}/render`, "POST", { version: 1 }))
          .text,
      ).id,
      JSON.parse(r.text).id,
    );
    const s = (await store.get(story.id))!;
    s.renders.push({
      version: 1,
      card: "fixture/card.png",
      story: "fixture/story.png",
      video: "fixture/video.mp4",
      captions: "fixture/captions.vtt",
      manifest: "fixture/manifest.json",
      duration: 65,
      voice: "Test",
      createdAt: now(),
      captionWarnings: ["Recognized number differs from script."],
    });
    await store.save(s, 1);
    assert.equal(
      (
        await call(`/api/stories/${story.id}/approve`, "POST", {
          version: 1,
          editor: "Test Editor",
          destinations: ["Instagram"],
          previewChecked: true,
        })
      ).status,
      422,
    );
    assert.equal(
      (
        await call(`/api/stories/${story.id}/approve`, "POST", {
          version: 1,
          editor: "Test Editor",
          destinations: ["Instagram"],
          previewChecked: true,
          captionsChecked: true,
        })
      ).status,
      200,
    );
    assert.equal((await call(`/s/${story.id.slice(0, 8)}?v=1`)).status, 200);
    const previousPassword = process.env.DASHBOARD_PASSWORD;
    process.env.DASHBOARD_PASSWORD = "isolated-test-password-123456";
    try {
      assert.equal((await call("/api/overview")).status, 401);
      assert.equal((await call("/media/renders/private.mp4")).status, 401);
      assert.equal(
        (
          await call("/api/overview", "GET", undefined, {
            Authorization:
              "Basic " +
              Buffer.from("editor:isolated-test-password-123456").toString(
                "base64",
              ),
          })
        ).status,
        200,
      );
      assert.equal((await call(`/s/${story.id.slice(0, 8)}?v=1`)).status, 200);
    } finally {
      if (previousPassword === undefined) delete process.env.DASHBOARD_PASSWORD;
      else process.env.DASHBOARD_PASSWORD = previousPassword;
    }
    const approved = (await store.get(story.id))!;
    const edit = {
      version: 1,
      title: "Edited programme headline",
      summary: approved.summary,
      category: approved.category,
      region: approved.region,
      eventAt: approved.eventAt,
      claims: approved.claims,
      segments: approved.segments,
    };
    assert.equal(
      (await call(`/api/stories/${story.id}`, "PUT", edit)).status,
      200,
    );
    assert.equal((await store.get(story.id))?.approval, undefined);
    assert.equal((await store.jobs())[0].status, "cancelled");
    assert.equal(
      (
        await call(`/api/stories/${story.id}/approve`, "POST", {
          version: 1,
          editor: "Test Editor",
          destinations: ["Instagram"],
          previewChecked: true,
        })
      ).status,
      409,
    );
    assert.match(
      (await call(`/s/${story.id.slice(0, 8)}?v=1`)).text,
      /An agency announces/,
    );
    assert.equal(
      (
        await call(`/api/stories/${story.id}/corrections`, "POST", {
          version: 2,
          text: "The programme title was corrected after review.",
        })
      ).status,
      200,
    );
    assert.match(
      (await call(`/s/${story.id.slice(0, 8)}?v=1`)).text,
      /programme title was corrected/,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await store.close();
  }
});
test(
  "PostgreSQL repository preserves content and uses conditional locks",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const store = new Store(process.env.TEST_DATABASE_URL);
    await store.init();
    const story = fixture();
    try {
      await store.create(story);
      const read = (await store.get(story.id))!;
      assert.equal(read.title, story.title);
      await store.save(invalidate(read), 1);
      assert.equal((await store.get(story.id))!.version, 2);
      await store.snapshot((await store.get(story.id))!);
      assert.equal((await store.history(story.id)).length, 1);
      const job: Job = {
        id: id(),
        storyId: story.id,
        version: 2,
        status: "queued",
        lease: 0,
        progress: "Queued",
        attempts: 0,
        createdAt: now(),
      };
      await store.addJob(job);
      const result = await Promise.all([
        store.claimJob(job.id),
        store.claimJob(job.id),
      ]);
      assert.equal(result.filter(Boolean).length, 1);
      await store.cancelJobs(story.id);
      assert.equal(
        (await store.jobs()).find((j) => j.id === job.id)!.status,
        "cancelled",
      );
      await store.query(
        "UPDATE pilot_budget SET limit_micros=200000,reserved_micros=0 WHERE id=?",
        ["pilot"],
      );
      const reservations = await Promise.allSettled(
        Array.from({ length: 3 }, (_, i) =>
          store.reserveCost({
            id: id(),
            operationKey: `${story.id}:${i}`,
            storyId: story.id,
            provider: "claude",
            operation: "test",
            reservedUsd: 0.1,
            state: "reserved",
            createdAt: now(),
          }),
        ),
      );
      assert.equal(
        reservations.filter((r) => r.status === "fulfilled").length,
        2,
      );
      assert.equal((await store.budget()).reservedUsd, 0.2);
    } finally {
      await store.query("DELETE FROM cost_events WHERE story_id=?", [story.id]);
      await store.query("DELETE FROM jobs WHERE story_id=?", [story.id]);
      await store.query("DELETE FROM versions WHERE story_id=?", [story.id]);
      await store.query("DELETE FROM stories WHERE id=?", [story.id]);
      await store.close();
    }
  },
);
