import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/db.js";
import { actualUsd } from "../server/pricing.js";
import type { CostEvent } from "../shared/types.js";

const event = (fields: Partial<CostEvent>): CostEvent => ({
  id: crypto.randomUUID(),
  operationKey: crypto.randomUUID(),
  storyId: "s",
  provider: "claude",
  operation: "draft",
  reservedUsd: 1,
  state: "succeeded",
  createdAt: "2026-11-01T10:00:00Z",
  ...fields,
});
const close = (a: number | undefined, b: number) =>
  assert.ok(a !== undefined && Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("pricing: Claude tokens, cache and web searches; Gemini text, thinking and audio; AssemblyAI seconds", () => {
  close(
    actualUsd(event({ usage: { input_tokens: 1e6, output_tokens: 1e5 } })),
    3 + 1.5,
  );
  close(
    actualUsd(
      event({
        operation: "web-research",
        usage: {
          discovery: {
            input_tokens: 0,
            output_tokens: 0,
            cache_read_input_tokens: 1e6,
            cache_creation_input_tokens: 2e6,
            cache_creation: { ephemeral_1h_input_tokens: 1e6 },
            server_tool_use: { web_search_requests: 3 },
          },
          verification: { input_tokens: 1e6, output_tokens: 0 },
        },
      }),
    ),
    0.3 + 3.75 + 6 + 0.03 + 3,
  );
  const verify = {
    usage: {
      verification: {
        total_input_tokens: 1e6,
        total_output_tokens: 1e6,
        total_thought_tokens: 1e6,
      },
    },
    provider: "gemini",
    operation: "web-verify-saved:gemini-3.8-flash",
  };
  close(actualUsd(event(verify)), 0.75 + 3.75 * 2);
  close(
    actualUsd(event({ ...verify, createdAt: "2027-01-02T00:00:00Z" })),
    (0.75 + 3.75 * 2) * 2,
  );
  const scene = {
    usage: { total_input_tokens: 1e6, total_output_tokens: 1e6 },
  };
  close(
    actualUsd(
      event({
        provider: "gemini",
        operation: "narration",
        usage: { scenes: 2, requests: [scene, scene] },
      }),
    ),
    (0.5 + 9) * 2,
  );
  // Older narration records only kept the last scene: keep the reservation.
  assert.equal(
    actualUsd(
      event({
        provider: "gemini",
        operation: "narration",
        usage: { scenes: 6, lastUsage: scene.usage },
      }),
    ),
    undefined,
  );
  close(
    actualUsd(event({ provider: "assemblyai", usage: { audioSeconds: 3600 } })),
    0.15,
  );
  assert.equal(actualUsd(event({ usage: { something: 1 } })), undefined);
  // A response without usage data must not be priced as free.
  assert.equal(
    actualUsd(
      event({
        operation: "web-verify-saved",
        usage: { verification: undefined },
      }),
    ),
    undefined,
  );
  assert.equal(
    actualUsd(
      event({
        operation: "web-research",
        usage: { verification: { input_tokens: 1, output_tokens: 1 } },
      }),
    ),
    undefined,
  );
  assert.equal(
    actualUsd(
      event({
        provider: "gemini",
        operation: "narration",
        usage: { scenes: 0, requests: [] },
      }),
    ),
    undefined,
  );
  assert.equal(actualUsd(event({})), undefined);
});

test("settlement: releases unused allowance once, keeps uncertain calls, records overruns, backfills on start", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "worldnews-cost-"));
  const filename = path.join(dir, "db.sqlite");
  const previous = process.env.PILOT_BUDGET_USD;
  process.env.PILOT_BUDGET_USD = "5";
  let store = new Store(undefined, filename);
  try {
    await store.init();
    const cheap = event({ state: "reserved" });
    await store.reserveCost(cheap);
    assert.equal((await store.budget()).reservedUsd, 1);
    cheap.usage = { input_tokens: 10_000, output_tokens: 2_000 }; // $0.06
    await store.finishCost(cheap); // still running: no settlement
    assert.equal((await store.budget()).reservedUsd, 1);
    cheap.state = "succeeded";
    await store.finishCost(cheap);
    assert.equal(cheap.actualUsd, 0.06);
    assert.equal((await store.budget()).reservedUsd, 0.06);
    await store.finishCost({ ...cheap, actualUsd: undefined }); // repeat
    assert.equal((await store.budget()).reservedUsd, 0.06);

    const uncertain = event({ state: "reserved" });
    await store.reserveCost(uncertain);
    uncertain.state = "uncertain";
    uncertain.usage = { input_tokens: 1, output_tokens: 1 };
    await store.finishCost(uncertain);
    assert.equal((await store.budget()).reservedUsd, 1.06);

    const over = event({ state: "reserved", reservedUsd: 0.5 });
    await store.reserveCost(over);
    over.state = "held";
    over.usage = { input_tokens: 0, output_tokens: 1e5 }; // $1.50
    await store.finishCost(over);
    assert.equal((await store.budget()).reservedUsd, 2.56);

    // A call finished before settlement existed is settled on next start.
    const legacy = event({ state: "reserved" });
    await store.reserveCost(legacy);
    legacy.state = "succeeded";
    legacy.usage = { input_tokens: 0, output_tokens: 1e4 }; // $0.15
    await store.query("UPDATE cost_events SET body=? WHERE id=?", [
      JSON.stringify(legacy),
      legacy.id,
    ]);
    await store.close();
    store = new Store(undefined, filename);
    await store.init();
    assert.equal((await store.budget()).reservedUsd, 2.71);
    await store.init();
    assert.equal((await store.budget()).reservedUsd, 2.71);
  } finally {
    if (previous === undefined) delete process.env.PILOT_BUDGET_USD;
    else process.env.PILOT_BUDGET_USD = previous;
    await store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
