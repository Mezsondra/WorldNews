import { Store } from "./db.js";
import { now, invalidate, productionGates, newStory } from "./domain.js";
import type { Story } from "../shared/types.js";
import { claudeAssist, validateDraft } from "./providers.js";
import { renderStory } from "./media.js";
const store = new Store(process.env.DATABASE_URL);
await store.init();
let pilotId = "";
try {
  const resumeIndex = process.argv.indexOf("--resume");
  let initial: Story;
  if (resumeIndex >= 0) {
    const old = await store.get(process.argv[resumeIndex + 1] || "");
    if (!old?.demo || !(await store.reports(old.id)).length)
      throw new Error("Resume needs an existing historical API-pilot dossier.");
    if (old.renders.some((r) => r.version === old.version))
      throw new Error(
        "This pilot already has a rendered preview. Inspect it before spending more.",
      );
    initial = { ...invalidate(old), pilot: true };
    await store.snapshot(old);
    await store.save(initial, old.version);
    await store.audit("pilot-explicit-resume", {
      storyId: old.id,
      version: initial.version,
    });
    console.log(
      "Explicit pilot continuation after inspection; starting a new revision.",
    );
  } else {
    const original = (await store.list()).find(
      (s) =>
        s.demo &&
        s.sources.some((source) =>
          source.url.includes("signal-acquired-nasas-europa-clipper"),
        ),
    );
    if (!original)
      throw new Error(
        "Seed the historical NASA example with npm run demo first.",
      );
    initial = {
      ...newStory(original.title),
      sources: structuredClone(original.sources),
      category: "Science",
      region: "Space",
      eventAt: "2024-10-14T16:06:00Z",
      demo: true,
      pilot: true,
      summary:
        "Historical API pilot. Source-linked narration and media remain subject to editorial review.",
    };
    await store.create(initial);
  }
  pilotId = initial.id;
  console.log(`Historical pilot dossier: ${initial.id}`);
  if (!(await store.reports(initial.id)).some((r) => r.kind === "research")) {
    console.log("Claude: analyzing original source snapshots (no web search).");
    await claudeAssist(store, initial, "research");
  }
  let draft = initial;
  if (!initial.segments.length) {
    const saved = (await store.reports(initial.id)).find(
      (r) => r.kind === "draft" && r.data.outcome === "draft",
    );
    console.log(
      saved
        ? "Rechecking the saved candidate after the inspected typography fix; no new Claude request."
        : "Claude: preparing a source-linked narration draft.",
    );
    const candidate = validateDraft(
      initial,
      saved ? saved.data : await claudeAssist(store, initial, "draft"),
    );
    if (saved)
      await store.addReport({
        id: crypto.randomUUID(),
        storyId: initial.id,
        version: initial.version,
        kind: "draft",
        createdAt: now(),
        data: {
          ...candidate,
          recovery:
            "Original source typography restored; factual words and numbers were not changed.",
        },
      });
    if (candidate.outcome === "hold")
      throw new Error(
        "Claude held the story. The reason is saved in the research panel; add evidence before another attempt.",
      );
    const current = (await store.get(initial.id))!;
    draft = invalidate({
      ...current,
      summary: candidate.summary,
      claims: candidate.claims.map((c) => ({ ...c, reviewed: false })),
      segments: candidate.segments,
      format: candidate.format,
    });
    await store.snapshot(current);
    await store.save(draft, current.version);
  }
  const issues = productionGates(draft);
  if (issues.length)
    throw new Error(`Draft needs evidence work: ${issues[0].message}`);
  console.log(
    `Draft saved: ${draft.segments.length} scenes; ${draft.claims.length} unreviewed claims.`,
  );
  draft.stage = "producing";
  await store.save(draft, draft.version);
  const render = await renderStory(
    draft,
    async (message) => {
      console.log(message);
    },
    store,
  );
  const latest = (await store.get(draft.id))!;
  if (latest.version !== draft.version)
    throw new Error(
      "Content changed during the pilot; the old render was not applied.",
    );
  latest.renders.push(render);
  latest.stage = "awaiting-review";
  latest.updatedAt = now();
  await store.save(latest, latest.version);
  await store.snapshot(latest);
  console.log(
    `Private pilot preview ready: ${render.duration.toFixed(1)} seconds. No claim was marked reviewed and no export was approved.`,
  );
  console.log(`Video: ${render.video}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Pilot failed.");
  if (pilotId) {
    const story = await store.get(pilotId);
    if (story && story.stage === "producing") {
      story.stage = "drafting";
      await store.save(story, story.version);
    }
  }
  process.exitCode = 1;
} finally {
  const budget = await store.budget();
  console.log(
    `Reserved allowance: US$${budget.reservedUsd.toFixed(2)} / US$${budget.limitUsd.toFixed(2)}. This is not an invoice.`,
  );
  await store.close();
}
