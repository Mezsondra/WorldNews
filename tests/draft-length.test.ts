import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/db.js";
import { createApp } from "../server/app.js";
import { newStory, now, gates } from "../server/domain.js";
import { validateDraft } from "../server/providers.js";

function fixture() {
  const story = newStory("Agency announcement");
  story.eventAt = "2026-11-01";
  const passage = "The agency announced its science programme.";
  story.sources = [
    {
      id: "S",
      publisher: "Agency",
      author: "Press office",
      title: "Announcement",
      url: "https://agency.example/announcement",
      publishedAt: "2026-11-01",
      retrievedAt: now(),
      hash: "snapshot",
      text: passage,
      language: "en",
      lineage: "Agency",
      kind: "primary",
      usage: "Fixture",
    },
  ];
  return {
    story,
    draft: (words: number) => ({
      outcome: "draft",
      reason: "",
      summary: "Source-linked programme announcement.",
      claims: [
        {
          id: "C",
          text: passage,
          status: "attributed statement",
          evidence: [{ sourceId: "S", passage, relation: "supports" }],
        },
      ],
      segments: Array.from({ length: Math.ceil(words / 70) }, (_, i) => ({
        id: `N${i}`,
        text: Array(Math.min(70, words - i * 70))
          .fill("agency")
          .join(" "),
        claimIds: ["C"],
      })),
    }),
  };
}
test("drafts require 140–205 words, including when the stored format is a legacy brief", () => {
  const { story, draft } = fixture();
  for (const [words, format] of [
    [140, "explainer"],
    [205, "explainer"],
  ] as const) {
    const result = validateDraft(story, draft(words));
    assert.equal(result.format, format);
    const next = {
      ...story,
      format: result.format,
      segments: result.segments,
      claims: result.claims.map((c) => ({ ...c, reviewed: false })),
    };
    assert(!gates(next).some((g) => g.code === "length"));
    assert(gates(next).some((g) => g.code === "review"));
  }
  for (const words of [59, 60, 119, 139])
    assert.throws(
      () => validateDraft({ ...story, format: "brief" }, draft(words)),
      /140–205/,
    );
  assert.throws(() => validateDraft(story, draft(206)), /140–205/);
  const bad = draft(140);
  bad.claims[0].evidence[0].passage = "Untraceable claim";
  assert.throws(() => validateDraft(story, bad), /untraceable/);
});
test("a valid saved draft is recovered once without another provider call or allowance change", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  const { story, draft } = fixture();
  await store.create(story);
  const report = {
    id: "saved-119",
    storyId: story.id,
    version: story.version,
    kind: "draft" as const,
    createdAt: now(),
    data: {
      ...draft(160),
      validationError:
        "Claude draft has 119 words; 140–205 are required. It was not applied.",
    },
  };
  await store.addReport(report);
  const invalid = {
    ...report,
    id: "invalid",
    data: { ...draft(160), validationError: "Held" },
  };
  invalid.data.claims[0].evidence[0].passage = "Fabricated passage";
  await store.addReport(invalid);
  const other = fixture().story;
  await store.create(other);
  await store.addReport({ ...report, id: "foreign", storyId: other.id });
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const request = (reportId: string, version = 1) =>
    fetch(
      `http://127.0.0.1:${port}/api/stories/${story.id}/ai-reports/${reportId}/apply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      },
    );
  try {
    const before = await store.budget();
    assert.equal((await request("foreign")).status, 404);
    assert.equal((await request("invalid")).status, 400);
    assert.equal((await store.get(story.id))!.version, 1);
    const response = await request(report.id);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.story.version, 2);
    assert.equal(result.story.format, "explainer");
    assert(result.story.claims.every((c: any) => !c.reviewed));
    assert.equal(result.story.approval, undefined);
    assert.deepEqual(result.story.sources, story.sources);
    assert.equal(result.story.segments[0].text, report.data.segments[0].text);
    assert.equal(result.report.data.validationError, undefined);
    assert.equal(result.report.data.appliedFrom, report.id);
    assert.deepEqual(await store.budget(), before);
    assert.equal((await store.costs()).length, 0);
    assert.equal((await request(report.id)).status, 409);
    assert.equal((await request(report.id, 2)).status, 409);
    assert.equal(
      (await store.reports(story.id)).find((r) => r.id === report.id)?.data
        .validationError,
      report.data.validationError,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close();
  }
});
