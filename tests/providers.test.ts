import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/db.js";
import { newStory, gates, productionGates, id, now } from "../server/domain.js";
import {
  reserve,
  claudeAssist,
  validateDraft,
  geminiSpeech,
  assemblyCaptions,
  captionDifferences,
} from "../server/providers.js";
import type { Fetcher } from "../server/providers.js";
import type { CostEvent } from "../shared/types.js";
process.env.PILOT_API_ENABLED = "true";
process.env.PILOT_BUDGET_USD = "5";
process.env.ANTHROPIC_API_KEY = "test-only-claude";
process.env.GEMINI_API_KEY = "test-only-google";
process.env.ASSEMBLYAI_API_KEY = "test-only-assembly";
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function story() {
  const s = newStory("Historical science announcement");
  s.eventAt = "2024-10-14T12:00:00Z";
  s.sources = [
    {
      id: "S1",
      url: "https://example.org/press",
      title: "Announcement",
      publisher: "Science Agency",
      author: "Press office",
      publishedAt: "2024-10-14",
      retrievedAt: now(),
      hash: "snapshot-hash",
      text: "The agency announced a science programme.",
      language: "en",
      lineage: "Science Agency",
      kind: "primary",
      usage: "Test fixture",
    },
  ];
  return s;
}
const draft = () => ({
  outcome: "draft",
  reason: "",
  summary: "Attributed draft.",
  claims: [
    {
      id: "C1",
      text: "The agency announced a science programme.",
      status: "attributed statement",
      evidence: [
        {
          sourceId: "S1",
          passage: "The agency announced a science programme.",
          relation: "supports",
        },
      ],
    },
  ],
  segments: [
    {
      id: "N1",
      text: Array(15)
        .fill("The agency said it announced a new science programme today.")
        .join(" "),
      claimIds: ["C1"],
    },
  ],
});
const event = (
  storyId: string,
  operationKey: string,
  reservedUsd: number,
): CostEvent => ({
  id: id(),
  operationKey,
  storyId,
  provider: "claude",
  operation: "test",
  reservedUsd,
  state: "reserved",
  createdAt: now(),
});
test("pilot ledger caps concurrent reservations and prevents duplicate operations", async () => {
  process.env.PILOT_BUDGET_USD = "0.5";
  const store = new Store(undefined, ":memory:");
  await store.init();
  try {
    const result = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        store.reserveCost(event("S", `op-${i}`, 0.1)),
      ),
    );
    assert.equal(result.filter((r) => r.status === "fulfilled").length, 5);
    assert.equal((await store.budget()).reservedUsd, 0.5);
    await assert.rejects(
      () => store.reserveCost(event("S", "op-0", 0.1)),
      /already attempted/,
    );
    assert.equal((await store.budget()).reservedUsd, 0.5);
  } finally {
    await store.close();
    process.env.PILOT_BUDGET_USD = "5";
  }
});
test("negative and invalid reservations cannot increase the available budget", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  try {
    for (const amount of [-1, NaN, Infinity, 0])
      await assert.rejects(
        () => store.reserveCost(event("S", "bad-" + String(amount), amount)),
        /finite positive/,
      );
    assert.equal((await store.budget()).reservedUsd, 0);
  } finally {
    await store.close();
  }
});
test("pilot spending survives restart and cannot be reset by changing the environment", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "worldnews-budget-"));
  const file = path.join(dir, "test.sqlite");
  let store = new Store(undefined, file);
  try {
    await store.init();
    await store.reserveCost(event("S", "one", 1));
    await store.close();
    process.env.PILOT_BUDGET_USD = "10";
    store = new Store(undefined, file);
    await store.init();
    assert.equal((await store.budget()).limitUsd, 5);
    assert.equal((await store.budget()).reservedUsd, 1);
  } finally {
    await store.close();
    process.env.PILOT_BUDGET_USD = "5";
    await rm(dir, { recursive: true, force: true });
  }
});
test("disabled pilot rejects calls before allocating budget", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  try {
    process.env.PILOT_API_ENABLED = "false";
    await assert.rejects(
      () => reserve(store, story(), "claude", "draft", 0.5),
      /disabled/,
    );
    assert.equal((await store.budget()).reservedUsd, 0);
  } finally {
    process.env.PILOT_API_ENABLED = "true";
    await store.close();
  }
});
test("Claude returns validated source-linked drafts without marking facts reviewed", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  const s = story();
  let calls = 0;
  const request: Fetcher = async (url, options) => {
    calls++;
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, "claude-sonnet-4-6");
    assert.equal(body.max_tokens, 3000);
    assert(body.system.includes("untrusted"));
    assert.equal(body.tool_choice.name, "editorial_result");
    return response({
      id: "msg_test",
      usage: { input_tokens: 300, output_tokens: 400 },
      content: [{ type: "tool_use", name: "editorial_result", input: draft() }],
    });
  };
  try {
    const output = validateDraft(
      s,
      await claudeAssist(store, s, "draft", request),
    );
    assert.equal(output.claims[0].evidence[0].sourceId, "S1");
    assert.equal("reviewed" in output.claims[0], false);
    assert.equal((await store.reports(s.id)).length, 1);
    assert.equal((await store.costs())[0].state, "succeeded");
    await assert.rejects(
      () => claudeAssist(store, s, "draft", request),
      /already attempted/,
    );
    assert.equal(calls, 1);
  } finally {
    await store.close();
  }
});
test("invalid Claude passages are never applied; paid reservation stays held", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  const s = story();
  const value = draft();
  value.claims[0].evidence[0].passage = "A fabricated claim.";
  try {
    await assert.rejects(
      () =>
        claudeAssist(store, s, "draft", async () =>
          response({
            content: [
              { type: "tool_use", name: "editorial_result", input: value },
            ],
          }),
        ),
      /untraceable/,
    );
    assert.equal((await store.budget()).reservedUsd, 0.5);
    assert.equal(
      typeof (await store.reports(s.id))[0].data.validationError,
      "string",
    );
  } finally {
    await store.close();
  }
});
test("Claude transport failure retains reservation and redacts provider error body", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  try {
    await assert.rejects(
      () =>
        claudeAssist(store, story(), "research", async () =>
          response({ error: "test-only-claude should never be echoed" }, 401),
        ),
      (error) =>
        error instanceof Error &&
        !error.message.includes("test-only-claude") &&
        error.message.includes("401"),
    );
    assert.equal((await store.costs())[0].state, "uncertain");
    assert.equal((await store.budget()).reservedUsd, 0.5);
  } finally {
    await store.close();
  }
});
test("Claude input is bounded before any provider request or reservation", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  const s = story();
  s.sources = Array.from({ length: 5 }, (_, i) => ({
    ...s.sources[0],
    id: "S" + i,
    text: "界".repeat(5000),
  }));
  try {
    await assert.rejects(
      () =>
        claudeAssist(store, s, "research", async () => {
          throw new Error("Must not call");
        }),
      /too large/,
    );
    assert.equal((await store.budget()).reservedUsd, 0);
  } finally {
    await store.close();
  }
});
test("private preview can precede claim review; approval still sees review gates", () => {
  const s = story();
  const output = validateDraft(s, draft());
  s.claims = output.claims.map((c) => ({ ...c, reviewed: false }));
  s.segments = output.segments;
  assert.deepEqual(productionGates(s), []);
  assert(gates(s).some((g) => g.code === "review"));
  s.claims[0].evidence[0].passage = "Made up";
  assert(productionGates(s).some((g) => g.code === "passage"));
});
test("Gemini uses audio endpoint, bounded generation, and a backend-only key header", async () => {
  const bytes = Buffer.alloc(200);
  bytes.write("RIFF");
  const result = await geminiSpeech(
    "A short narration test.",
    "Kore",
    async (url, options) => {
      assert.equal(
        url,
        "https://generativelanguage.googleapis.com/v1beta/interactions",
      );
      assert(!String(url).includes("test-only-google"));
      const body = JSON.parse(String(options?.body));
      assert.equal(body.model, "gemini-3.8-flash-tts");
      assert.equal(body.generation_config.max_output_tokens, 4096);
      assert.equal(body.response_format.type, "audio");
      assert.equal(body.store, false);
      return response({
        id: "gemini-test",
        usage: { total_output_tokens: 200 },
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "audio",
                mime_type: "audio/wav",
                data: bytes.toString("base64"),
              },
            ],
          },
        ],
      });
    },
  );
  assert.equal(result.audio.length, 200);
});
test("Gemini rejects missing audio without silently using the local voice", async () => {
  await assert.rejects(
    () => geminiSpeech("Test", "Kore", async () => response({ steps: [] })),
    /no usable audio/,
  );
});
test("AssemblyAI submits once, persists provider ID, then polls read-only for word timings", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  const s = story();
  const cost = await reserve(store, s, "assemblyai", "captions", 0.1);
  const urls: string[] = [];
  const replies = [
    { upload_url: "https://cdn.assemblyai.com/test.wav" },
    { id: "transcript-test", status: "queued" },
    { status: "processing" },
    {
      status: "completed",
      text: "A test.",
      audio_duration: 1,
      words: [
        { text: "A", start: 0, end: 200 },
        { text: "test.", start: 250, end: 900 },
      ],
    },
  ];
  try {
    const result = await assemblyCaptions(
      store,
      cost,
      Buffer.alloc(100),
      async (url, options) => {
        urls.push(String(url));
        if (String(url).endsWith("/transcript") && options?.method === "POST") {
          const body = JSON.parse(String(options.body));
          assert.deepEqual(body.speech_models, ["universal-2"]);
          assert.equal(body.entity_detection, undefined);
        }
        return response(replies.shift());
      },
      async () => {},
    );
    assert.equal(urls.filter((u) => u.endsWith("/transcript")).length, 1);
    assert.equal(result.words[1].start, 250);
    assert.equal((await store.costs())[0].providerId, "transcript-test");
    assert.equal((await store.costs())[0].state, "succeeded");
  } finally {
    await store.close();
  }
});
test("transcription failure retains provider ID for reconciliation instead of resubmission", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  const cost = await reserve(store, story(), "assemblyai", "captions", 0.1);
  const replies = [
    { upload_url: "https://cdn.assemblyai.com/test.wav" },
    { id: "saved-transcript" },
    { status: "error", error: "provider internal body" },
  ];
  try {
    await assert.rejects(
      () =>
        assemblyCaptions(
          store,
          cost,
          Buffer.alloc(100),
          async () => response(replies.shift()),
          async () => {},
        ),
      /could not transcribe/,
    );
    const saved = (await store.costs())[0];
    assert.equal(saved.providerId, "saved-transcript");
    assert.equal(saved.state, "uncertain");
    assert.equal((await store.budget()).reservedUsd, 0.1);
  } finally {
    await store.close();
  }
});
test("caption comparison flags changed numbers and normalizes case and punctuation", () => {
  assert.deepEqual(
    captionDifferences("NASA announced 49 flybys.", [
      { text: "nasa", start: 0, end: 100 },
      { text: "announced", start: 100, end: 200 },
      { text: "49", start: 200, end: 300 },
      { text: "flybys", start: 300, end: 400 },
    ]),
    [],
  );
  assert.equal(
    captionDifferences("49 flybys", [
      { text: "forty", start: 0, end: 100 },
      { text: "flybys", start: 100, end: 200 },
    ]).length,
    1,
  );
});
test("Claude quotation typography is restored to the original snapshot without changing words or numbers", () => {
  const s = story();
  s.sources[0].text = "The agency’s mission has 49 flybys.";
  const value = draft();
  value.claims[0].evidence[0].passage = "The agency's mission has 49 flybys.";
  assert.equal(
    validateDraft(s, value).claims[0].evidence[0].passage,
    "The agency’s mission has 49 flybys.",
  );
  value.claims[0].evidence[0].passage = "The agency's mission has 50 flybys.";
  assert.throws(() => validateDraft(s, value), /untraceable/);
});
