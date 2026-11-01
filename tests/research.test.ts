import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/db.js";
import { gates, id, newStory, now } from "../server/domain.js";
import {
  queueResearch,
  runResearch,
  searchResults,
  validateVerification,
  rankResearchCandidates,
  evidenceCatalog,
  resolveEvidenceReferences,
} from "../server/research.js";
import { createApp } from "../server/app.js";
import type { Fetcher } from "../server/providers.js";
import type { Source, Story } from "../shared/types.js";

process.env.PILOT_API_ENABLED = "true";
process.env.PILOT_BUDGET_USD = "5";
process.env.ANTHROPIC_API_KEY = "test-only";
process.env.GEMINI_API_KEY = "test-only-google";
const response = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
function source(
  sourceId = "S1",
  url = "https://reporter.example/news",
): Source {
  return {
    id: sourceId,
    url,
    title: "Court dispute",
    publisher: "Reporter",
    author: "Staff",
    publishedAt: "2026-10-31",
    retrievedAt: now(),
    hash: `hash-${sourceId}`,
    text: "The court said it would hear the case. The government disputed that account.",
    language: "en",
    lineage: "Reporter",
    kind: "secondary",
    usage: "Fixture",
  };
}
function findings(story: Story) {
  return {
    summary: "The accounts differ; further evidence is needed.",
    outcome: "hold",
    reason: "The available accounts do not settle the dispute.",
    sources: story.sources.map((s) => ({
      sourceId: s.id,
      kind: s.id === "S2" ? "primary" : "secondary",
      lineage: s.id === "S2" ? "Court" : "Reporter",
      assessment: "Source classification is provisional.",
    })),
    claims: [
      {
        text: "The court said it would hear the case.",
        status: "attributed statement",
        evidence: [
          {
            sourceId: "S2",
            passage: "The court said it would hear the case.",
            relation: "supports",
          },
        ],
      },
    ],
    gaps: ["Independent confirmation is missing."],
    perspectives: [],
    cautions: [
      "Public statements establish what was said, not the underlying allegations.",
    ],
  };
}
async function setup() {
  const store = new Store(undefined, ":memory:");
  await store.init();
  const story = newStory("Poland Constitutional Crisis");
  story.sources = [source()];
  await store.create(story);
  return { store, story };
}
const discovery = () => ({
  id: "msg_search",
  usage: { input_tokens: 500, server_tool_use: { web_search_requests: 2 } },
  stop_reason: "end_turn",
  content: [
    {
      type: "server_tool_use",
      name: "web_search",
      input: { query: "Poland court original statement October 2026" },
    },
    {
      type: "web_search_tool_result",
      content: [
        {
          type: "web_search_result",
          url: "https://court.example/statement",
          title: "Original statement",
        },
        {
          type: "web_search_result",
          url: "https://blocked.example/article",
          title: "Inaccessible report",
        },
      ],
    },
  ],
});

test("search candidates come only from actual tool results; unsafe URLs and tracking duplicates are excluded", () => {
  const results = searchResults([
    { type: "text", text: "https://invented.example/false" },
    {
      type: "web_search_tool_result",
      content: [
        {
          type: "web_search_result",
          url: "https://example.org/a?utm_source=x#top",
          title: "A",
        },
        {
          type: "web_search_result",
          url: "https://example.org/a",
          title: "A duplicate",
        },
        {
          type: "web_search_result",
          url: "http://127.0.0.1/admin",
          title: "Unsafe",
        },
        {
          type: "web_search_result",
          url: "https://user:secret@example.org/",
          title: "Unsafe credentials",
        },
      ],
    },
    {
      type: "web_search_tool_result",
      content: {
        type: "web_search_tool_result_error",
        error_code: "unavailable",
      },
    },
  ]);
  assert.equal(results.candidates.length, 1);
  assert.equal(results.candidates[0].url, "https://example.org/a");
  assert(results.warnings.some((w) => w.includes("unavailable")));
});

test("research queue and persistent conditional claim permit only one worker per story", async () => {
  const { store, story } = await setup();
  try {
    const run = await queueResearch(store, story);
    await assert.rejects(() => queueResearch(store, story), /already queued/);
    const claims = await Promise.all([
      store.claimResearch(run.id),
      store.claimResearch(run.id),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal((await store.researchRuns())[0].status, "running");
    assert.equal((await store.budget()).reservedUsd, 0);
  } finally {
    await store.close();
  }
});

test("a research job searches, retrieves and verifies with one reservation, invalidates approval, and leaves claims unreviewed", async () => {
  const { store, story } = await setup();
  try {
    story.approval = {
      version: 1,
      at: now(),
      editor: "Old approval",
      destinations: ["export"],
    };
    await store.save(story, story.version);
    const run = await queueResearch(store, story);
    assert(await store.claimResearch(run.id));
    run.status = "running";
    let calls = 0;
    const request: Fetcher = async (url, options) => {
      assert.equal(url, "https://api.anthropic.com/v1/messages");
      assert.equal(options?.redirect, "error");
      const body = JSON.parse(String(options?.body));
      calls++;
      assert(body.system.includes("untrusted"));
      if (calls === 1) {
        assert.equal(body.tools[0].max_uses, 4);
        assert(body.system.includes("original-language"));
        return response(discovery());
      }
      assert.equal(body.tool_choice.name, "verification_result");
      const input = JSON.parse(body.messages[0].content);
      assert.equal(input.sources.length, 2);
      assert(!JSON.stringify(input).includes("blocked.example"));
      return response({
        id: "msg_verify",
        usage: { output_tokens: 600 },
        content: [
          {
            type: "tool_use",
            name: "verification_result",
            input: findings({
              ...story,
              sources: [
                story.sources[0],
                source("S2", "https://court.example/statement"),
              ],
            }),
          },
        ],
      });
    };
    await runResearch(store, run, request, async (url) => {
      if (url.includes("blocked")) throw new Error("not readable");
      return source("S2", url);
    });
    assert.equal(calls, 2);
    assert.equal(run.status, "succeeded");
    assert(run.progress.includes("gaps remain"));
    const next = (await store.get(story.id))!;
    assert.equal(next.version, 2);
    assert.equal(next.approval, undefined);
    assert.equal(next.sources.length, 2);
    assert.equal(next.sources[1].kind, "primary");
    assert.equal(next.sources[1].research?.metadataReviewed, false);
    assert.equal(next.claims[0].reviewed, false);
    assert.equal(next.claims[0].status, "attributed statement");
    assert.equal((await store.researchSources(run.id)).length, 1);
    assert.equal((await store.reports(story.id))[0].kind, "verification");
    assert.equal((await store.budget()).reservedUsd, 1);
    assert.equal((await store.costs())[0].state, "succeeded");
    const gateStory = {
      ...next,
      eventAt: now(),
      segments: [
        {
          id: id(),
          text: Array(15)
            .fill("The court said it would hear the case next month.")
            .join(" "),
          claimIds: [next.claims[0].id],
        },
      ],
    };
    gateStory.claims[0].reviewed = true;
    assert(gates(gateStory).some((g) => g.code === "provenance"));
  } finally {
    await store.close();
  }
});

test("same-lineage syndicated reports cannot establish independent support, and invented passages are rejected", () => {
  const story = newStory("Court");
  story.sources = [
    source(),
    {
      ...source("S2", "https://syndicator.example/report"),
      research: { runId: "run", assessment: "Pending" },
    },
  ];
  const result = findings(story);
  result.sources.forEach((s) => {
    s.lineage = "Reuters";
    s.kind = "secondary";
  });
  result.claims[0].status = "supported fact";
  result.claims[0].evidence.push({
    ...result.claims[0].evidence[0],
    sourceId: "S1",
  });
  assert.equal(
    validateVerification(story, result, "run").claims[0].status,
    "insufficient evidence",
  );
  result.claims[0].evidence[0].passage =
    "The court secretly dismissed the case.";
  assert.throws(
    () => validateVerification(story, result, "run"),
    /does not match/,
  );
});

test("contradicting evidence always results in a disputed claim", () => {
  const story = newStory("Court");
  story.sources = [source("S2")];
  const result = findings(story);
  result.claims[0].status = "supported fact";
  result.claims[0].evidence[0].relation = "contradicts";
  assert.equal(
    validateVerification(story, result, "run").claims[0].status,
    "disputed",
  );
});

test("invalid verification retains retrieved snapshots and the allowance; no claims or duplicate paid retries", async () => {
  const { store, story } = await setup();
  try {
    const run = await queueResearch(store, story);
    await store.claimResearch(run.id);
    run.status = "running";
    let calls = 0;
    const request: Fetcher = async () => {
      calls++;
      if (calls === 1) return response(discovery());
      const result = findings({
        ...story,
        sources: [...story.sources, source("S2")],
      });
      result.claims[0].evidence[0].passage = "Invented text";
      return response({
        content: [
          { type: "tool_use", name: "verification_result", input: result },
        ],
      });
    };
    await runResearch(store, run, request, async (url) => source("S2", url));
    assert.equal(run.status, "failed");
    assert.match(run.error!, /does not match/);
    assert.match(
      String((await store.reports(story.id))[0].data.validationError),
      /does not match/,
    );
    assert.equal((await store.get(story.id))!.claims.length, 0);
    assert.equal((await store.researchSources(run.id)).length, 1);
    assert.equal((await store.budget()).reservedUsd, 1);
    await assert.rejects(
      () => queueResearch(store, story),
      /already attempted/,
    );
    assert.equal(calls, 2);
  } finally {
    await store.close();
  }
});

test("concurrent story edits stop research before stale evidence can be applied", async () => {
  const { store, story } = await setup();
  try {
    const run = await queueResearch(store, story);
    await store.claimResearch(run.id);
    run.status = "running";
    let calls = 0;
    const request: Fetcher = async () => {
      calls++;
      const changed = (await store.get(story.id))!;
      changed.stage = "held";
      await store.save(changed, changed.version);
      return response(discovery());
    };
    await runResearch(store, run, request, async () => {
      throw new Error("must not retrieve");
    });
    assert.equal(calls, 1);
    assert.equal(run.status, "failed");
    assert.match(run.error!, /story changed/);
    assert.equal((await store.get(story.id))!.stage, "held");
    assert.equal((await store.get(story.id))!.sources.length, 1);
  } finally {
    await store.close();
  }
});

test("provider search errors are surfaced without manufacturing evidence", async () => {
  const { store, story } = await setup();
  try {
    const run = await queueResearch(store, story);
    await store.claimResearch(run.id);
    run.status = "running";
    await runResearch(store, run, async () =>
      response({
        content: [
          {
            type: "web_search_tool_result",
            content: { error_code: "unavailable" },
          },
        ],
      }),
    );
    assert.equal(run.status, "failed");
    assert(run.warnings.some((w) => w.includes("unavailable")));
    assert.equal((await store.get(story.id))!.version, 1);
    assert.equal((await store.costs())[0].state, "uncertain");
  } finally {
    await store.close();
  }
});

test("research refuses to queue when the remaining pilot allowance is insufficient", async () => {
  const { store, story } = await setup();
  try {
    await store.reserveCost({
      id: id(),
      operationKey: "other",
      storyId: story.id,
      provider: "fixture",
      operation: "used",
      reservedUsd: 4.1,
      state: "succeeded",
      createdAt: now(),
    });
    await assert.rejects(() => queueResearch(store, story), /US\$1.00/);
    assert.equal((await store.researchRuns()).length, 0);
  } finally {
    await store.close();
  }
});

test("saved-source recovery verifies once without repeating web search or network retrieval", async () => {
  const { store, story } = await setup();
  try {
    const failed = await queueResearch(store, story);
    await store.claimResearch(failed.id);
    failed.status = "failed";
    failed.candidates = [
      {
        url: "https://court.example/statement",
        title: "Court",
        status: "retrieved",
      },
    ];
    await store.addResearchSource(failed.id, {
      ...source("S2", "https://court.example/statement"),
      research: { runId: failed.id, assessment: "Pending" },
    });
    await store.updateResearch(failed);
    const run = await queueResearch(store, story, failed.id);
    await store.claimResearch(run.id);
    run.status = "running";
    let calls = 0;
    await runResearch(
      store,
      run,
      async (_url, options) => {
        calls++;
        const body = JSON.parse(String(options?.body));
        assert.equal(body.tools[0].name, "verification_result");
        return response({
          content: [
            {
              type: "tool_use",
              name: "verification_result",
              input: findings({
                ...story,
                sources: [story.sources[0], source("S2")],
              }),
            },
          ],
        });
      },
      async () => {
        throw new Error("Recovery must use saved snapshots");
      },
    );
    assert.equal(calls, 1);
    assert.equal(run.status, "succeeded");
    assert.equal((await store.budget()).reservedUsd, 0.5);
    assert.equal((await store.costs())[0].operation, "web-verify-saved");
    await assert.rejects(
      () => queueResearch(store, story, failed.id),
      /already attempted/,
    );
    const latest = (await store.get(story.id))!;
    await assert.rejects(
      () => queueResearch(store, latest, failed.id),
      /No failed research run/,
    );
  } finally {
    await store.close();
  }
});

test("official documents are scheduled before encyclopaedia leads without automatically classifying them", () => {
  const story = newStory("Court");
  const candidates = [
    "https://en.wikipedia.org/wiki/Court",
    "https://news.example/a",
    "https://www.gov.pl/web/justice/statement",
  ].map((url) => ({ url, title: url, status: "found" as const }));
  const ranked = rankResearchCandidates(candidates, story);
  assert(ranked[0].url.includes("gov.pl"));
  assert(ranked.at(-1)!.url.includes("wikipedia"));
  assert.equal(story.sources.length, 0);
});

test("HTTP creates auto-research dossiers, permits manual opt-out and rejects concurrent actions", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const post = (url: string, body: unknown) =>
    fetch(`http://127.0.0.1:${address.port}/api${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const created = await post("/stories", { title: "Court event" });
    assert.equal(created.status, 201);
    const story = await created.json();
    assert.equal(
      (await store.researchRuns()).filter((r) => r.storyId === story.id).length,
      1,
    );
    assert.equal(
      (await post(`/stories/${story.id}/research`, { version: 1 })).status,
      409,
    );
    assert.equal(
      (await post(`/stories/${story.id}/research`, { version: 99 })).status,
      409,
    );
    assert.equal(
      (
        await post(`/stories/${story.id}/assist`, {
          version: 1,
          kind: "research",
        })
      ).status,
      409,
    );
    const manual = await (
      await post("/stories", { title: "Manual", research: false })
    ).json();
    assert(!(await store.researchRuns()).some((r) => r.storyId === manual.id));
    assert.equal((await store.budget()).reservedUsd, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close();
  }
});

test(
  "PostgreSQL persists research snapshots and conditionally claims a run",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const store = new Store(process.env.TEST_DATABASE_URL);
    await store.init();
    const story = newStory("Research persistence fixture");
    const run = {
      id: id(),
      storyId: story.id,
      version: 1,
      revision: 0,
      status: "queued" as const,
      progress: "Queued",
      createdAt: now(),
      lease: 0,
      queries: [],
      candidates: [],
      warnings: [],
    };
    try {
      await store.addResearch(run);
      await assert.rejects(
        () => store.addResearch({ ...run, id: id() }),
        /already queued/,
      );
      const claims = await Promise.all([
        store.claimResearch(run.id),
        store.claimResearch(run.id),
      ]);
      assert.equal(claims.filter(Boolean).length, 1);
      await store.addResearchSource(run.id, source());
      assert.equal(
        (await store.researchSources(run.id))[0].text,
        source().text,
      );
      assert.equal(
        (await store.researchRuns()).find((r) => r.id === run.id)!.status,
        "running",
      );
    } finally {
      await store.query("DELETE FROM research_sources WHERE run_id=?", [
        run.id,
      ]);
      await store.query("DELETE FROM research_runs WHERE id=?", [run.id]);
      await store.close();
    }
  },
);

test("passage references copy original stored text and reject IDs belonging to another source", () => {
  const sources = [source(), source("S2")];
  const passage = evidenceCatalog(sources).find((p) => p.sourceId === "S2")!;
  const output = {
    claims: [
      {
        text: "Attributed claim",
        evidence: [
          { sourceId: "S2", passageId: passage.id, relation: "supports" },
        ],
      },
    ],
  };
  const resolved = resolveEvidenceReferences(sources, output);
  assert.equal(resolved.claims[0].evidence[0].passage, passage.text);
  assert(sources[1].text.includes(resolved.claims[0].evidence[0].passage));
  output.claims[0].evidence[0].sourceId = "S1";
  assert.throws(
    () => resolveEvidenceReferences(sources, output),
    /unknown passage|wrong source/,
  );
});

test("explicit Gemini recovery uses fixed passage IDs, backend headers and its own capped allowance", async () => {
  const { store, story } = await setup();
  try {
    const failed = await queueResearch(store, story);
    await store.claimResearch(failed.id);
    failed.status = "failed";
    failed.candidates = [
      {
        url: "https://court.example/statement",
        title: "Court",
        status: "retrieved",
      },
    ];
    await store.addResearchSource(failed.id, {
      ...source("S2", "https://court.example/statement"),
      research: { runId: failed.id, assessment: "Pending" },
    });
    await store.updateResearch(failed);
    const run = await queueResearch(store, story, failed.id, "gemini");
    await store.claimResearch(run.id);
    run.status = "running";
    let calls = 0;
    await runResearch(store, run, async (url, options) => {
      calls++;
      assert.equal(
        url,
        "https://generativelanguage.googleapis.com/v1beta/interactions",
      );
      assert.equal(
        (options?.headers as Record<string, string>)["x-goog-api-key"],
        "test-only-google",
      );
      const body = JSON.parse(String(options?.body));
      assert.equal(body.generation_config.max_output_tokens, 4500);
      assert.equal(body.response_format.mime_type, "application/json");
      assert.equal(body.model, "gemini-3.8-flash");
      assert.equal(body.store, false);
      const input = JSON.parse(body.input);
      const result = findings({
        ...story,
        sources: [story.sources[0], source("S2")],
      });
      const output = {
        ...result,
        claims: [
          {
            ...result.claims[0],
            evidence: [
              {
                sourceId: "S2",
                passageId: input.sources[1].passages[0].id,
                relation: "supports",
              },
            ],
          },
        ],
      };
      return response({
        id: "google-result",
        usage: { total_tokens: 900 },
        steps: [
          {
            type: "model_output",
            content: [{ type: "text", text: JSON.stringify(output) }],
          },
        ],
      });
    });
    assert.equal(calls, 1);
    assert.equal(run.status, "succeeded");
    assert.equal((await store.budget()).reservedUsd, 0.15);
    const latest = (await store.get(story.id))!;
    assert.equal(latest.claims[0].evidence[0].passage, source("S2").text);
    assert.equal(latest.claims[0].reviewed, false);
    assert.equal(
      (await store.reports(story.id))[0].data.verificationProvider,
      "gemini",
    );
    await assert.rejects(
      () => queueResearch(store, story, failed.id, "gemini"),
      /already attempted/,
    );
  } finally {
    await store.close();
  }
});

test("only the exact inspected unbilled Google rejection can release a reservation, once", async () => {
  const { store, story } = await setup();
  try {
    const run = await queueResearch(store, story);
    await store.claimResearch(run.id);
    run.status = "failed";
    run.error =
      "Gemini evidence checker returned HTTP 400. No automatic retry was made.";
    await store.updateResearch(run);
    const event = {
      id: id(),
      operationKey: `${story.id}:1:gemini:web-verify-saved:fixture`,
      storyId: story.id,
      provider: "gemini",
      operation: "web-verify-saved:fixture",
      reservedUsd: 0.15,
      state: "uncertain" as const,
      createdAt: now(),
      researchRunId: run.id,
    };
    await store.reserveCost(event);
    const uncertain = {
      ...event,
      id: id(),
      operationKey: `${story.id}:1:gemini:web-verify-saved:other`,
      researchRunId: "unrelated-run",
    };
    await store.reserveCost(uncertain);
    await assert.rejects(
      () => store.reconcileGoogleRejection(uncertain.id, 400),
      /matching inspected/,
    );
    await store.reconcileGoogleRejection(event.id, 400);
    assert.equal((await store.budget()).reservedUsd, 0.15);
    assert.equal(
      (await store.costs()).find((e) => e.id === event.id)!.state,
      "released",
    );
    await assert.rejects(
      () => store.reconcileGoogleRejection(event.id, 400),
      /Only an inspected/,
    );
    assert.equal((await store.budget()).reservedUsd, 0.15);
    await assert.rejects(() => store.reserveCost(event), /already attempted/);
  } finally {
    await store.close();
  }
});
