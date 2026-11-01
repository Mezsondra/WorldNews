import type { Job, Story, Claim } from "../shared/types.js";
import { Store } from "./db.js";
import {
  gates,
  id,
  invalidate,
  now,
  previewGates,
  wordCount,
} from "./domain.js";

export function automaticScript(story: Story) {
  if (story.eventAt && Number.isNaN(Date.parse(story.eventAt)))
    throw new Error(
      "Correct the invalid event date before automatic production.",
    );
  if (["held", "rejected", "approved"].includes(story.stage))
    throw new Error("Resume an editable story before automatic production.");
  const eligible: Claim[] = story.claims.filter((claim) => {
    if (!["supported fact", "attributed statement"].includes(claim.status))
      return false;
    const probe = {
      ...story,
      segments: [{ id: "probe", text: claim.text, claimIds: [claim.id] }],
    };
    return !previewGates(probe).some((g) => g.code !== "length");
  });
  if (!eligible.length)
    throw new Error(
      "No claims pass the evidence checks. More research is needed before a video can be made.",
    );
  let words = 0;
  const segments = [];
  for (const claim of eligible) {
    const publishers = [
      ...new Set(
        claim.evidence
          .filter((e) => e.relation === "supports")
          .map((e) => story.sources.find((s) => s.id === e.sourceId)?.publisher)
          .filter((p): p is string => !!p),
      ),
    ].slice(0, 2);
    // Copy the checked finding verbatim; add only its recorded publisher attribution.
    const text = `Reporting from ${publishers.join(" and ")}: ${claim.text}`;
    const count = text.split(/\s+/).length;
    if (words + count > 185) continue;
    words += count;
    segments.push({ id: id(), text, claimIds: [claim.id] });
    if (segments.length === 6) break;
  }
  if (words < 60)
    throw new Error(
      `Only ${words} usable narration words are supported. Add evidence; the bot will not pad the script.`,
    );
  const omitted = story.claims.length - segments.length;
  const warnings = [
    "Private automatic preview: narration copies source-linked research findings. Claim and source review are still required.",
  ];
  if (omitted)
    warnings.push(
      `${omitted} claim(s) were left out because they were unresolved or outside the bounded update.`,
    );
  if (!story.eventAt)
    warnings.push(
      "Event date is unconfirmed; the preview displays Date pending. Confirm the event date before final production.",
    );
  if (story.sources.some((s) => s.research && !s.research.metadataReviewed))
    warnings.push(
      "Bot source classifications and originating lineages remain provisional.",
    );
  const next = invalidate({
    ...story,
    segments,
    format: words < 140 ? "brief" : "explainer",
    automation: {
      enabled: true,
      state: "rendering",
      message: "Script prepared; creating a private video with local narration",
      warnings,
    },
  });
  const issues = previewGates(next);
  if (issues.length) throw new Error(issues[0].message);
  return next;
}

export async function queueAutomaticVideo(store: Store, story: Story) {
  if (["held", "rejected", "approved"].includes(story.stage))
    throw Object.assign(
      new Error("Resume an editable story before automatic production."),
      { status: 422 },
    );
  const active = (await store.jobs()).find(
    (j) => j.storyId === story.id && ["queued", "running"].includes(j.status),
  );
  if (active) return active;
  if (story.renders.some((r) => r.version === story.version))
    throw Object.assign(
      new Error("This version already has a video. Review it in Preview."),
      { status: 409 },
    );
  if (
    (await store.jobs()).some(
      (j) =>
        j.storyId === story.id &&
        j.version === story.version &&
        j.status === "failed",
    )
  ) {
    const next = invalidate(story);
    next.automation = {
      enabled: true,
      state: next.segments.length ? "rendering" : "waiting-research",
      message:
        "Explicit continuation after inspecting the stopped production job",
      warnings: story.automation?.warnings || [],
    };
    await store.snapshot(story);
    await store.save(next, story.version);
    await store.audit("automatic-video-explicit-continuation", {
      storyId: story.id,
      previousVersion: story.version,
      version: next.version,
    });
    return next.automation;
  }
  story.automation = {
    enabled: true,
    state: "waiting-research",
    message: "Waiting for source research before preparing the video",
    warnings: [],
  };
  await store.save(story, story.version);
  await store.audit("automatic-video-enabled", {
    storyId: story.id,
    version: story.version,
  });
  return story.automation;
}

export async function scheduleAutomaticVideos(store: Store) {
  const jobs = await store.jobs(),
    runs = await store.researchRuns();
  for (const story of await store.list()) {
    const flow = story.automation;
    if (
      !flow?.enabled ||
      ["ready", "blocked"].includes(flow.state) ||
      ["held", "rejected", "approved"].includes(story.stage)
    )
      continue;
    if (
      jobs.some(
        (j) =>
          j.storyId === story.id && ["queued", "running"].includes(j.status),
      )
    )
      continue;
    if (
      runs.some(
        (r) =>
          r.storyId === story.id && ["queued", "running"].includes(r.status),
      )
    )
      continue;
    if (
      jobs.some(
        (j) =>
          j.storyId === story.id &&
          j.version === story.version &&
          j.status === "failed",
      )
    ) {
      flow.state = "blocked";
      flow.message =
        "Production stopped. Inspect the failed job before explicitly continuing.";
      await store.save(story, story.version);
      continue;
    }
    const render = story.renders.find((r) => r.version === story.version);
    if (render) {
      flow.state = "ready";
      flow.message = "Private video ready in Preview";
      await store.save(story, story.version);
      continue;
    }
    const rendering = flow.state === "rendering" && !!story.segments.length;
    if (!rendering && !story.claims.length) {
      flow.state = "blocked";
      flow.message =
        "Research has not produced usable claims. Inspect research progress and the available API allowance.";
      await store.save(story, story.version);
      continue;
    }
    const job: Job = {
      id: id(),
      storyId: story.id,
      version: story.version,
      kind: rendering ? "render" : "prepare",
      privatePreview: true,
      status: "queued",
      progress: rendering
        ? "Waiting for local video render"
        : "Preparing source-linked narration",
      attempts: 0,
      lease: 0,
      createdAt: now(),
    };
    try {
      await store.addJob(job);
    } catch {
      continue;
    }
    flow.state = rendering ? "rendering" : "queued";
    flow.message = job.progress;
    // A concurrent edit wins; the versioned worker will reject or recheck the queued input.
    try {
      await store.save(story, story.version);
    } catch {}
  }
}

export async function prepareAutomaticVideo(store: Store, input: Story) {
  const next = automaticScript(input);
  await store.snapshot(input);
  await store.save(next, input.version);
  await store.addReport({
    id: id(),
    storyId: input.id,
    version: next.version,
    kind: "draft",
    createdAt: now(),
    data: {
      outcome: "draft",
      summary:
        "Automatic extractive narration prepared from eligible research claims. No model call was made.",
      method: "source-linked extractive script",
      words: wordCount(next),
      warnings: next.automation!.warnings,
    },
  });
  await store.audit("automatic-script-prepared", {
    storyId: next.id,
    version: next.version,
    words: wordCount(next),
    deferredChecks: gates(next).filter((g) =>
      ["review", "provenance", "date"].includes(g.code),
    ).length,
  });
  // The durable scheduler queues rendering from the saved checkpoint on its next tick.
  return next;
}
