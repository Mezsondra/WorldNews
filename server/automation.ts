import type { Job, Story, Claim, Source } from "../shared/types.js";
import { Store } from "./db.js";
import { qualityReleaseIssues } from "./video-quality.js";
import {
  discoverStoryMedia,
  attachDiscoveredVisuals,
} from "./media-discovery.js";
import {
  gates,
  id,
  invalidate,
  now,
  previewGates,
  wordCount,
  narrationFormat,
  NARRATION_LIMITS,
} from "./domain.js";

// "Federal Bureau of Investigation" is named by its full name or its initials, "FBI".
export function namesSource(text: string, publisher: string) {
  const initials = publisher
    .split(/\s+/)
    .filter((w) => /^\p{Lu}/u.test(w))
    .map((w) => w[0])
    .join("");
  return (
    text.toLowerCase().includes(publisher.toLowerCase()) ||
    (initials.length >= 2 && new RegExp(`\\b${initials}\\b`).test(text))
  );
}
export function automaticScript(story: Story) {
  if (story.eventAt && Number.isNaN(Date.parse(story.eventAt)))
    throw new Error(
      "Correct the invalid event date before automatic production.",
    );
  if (["held", "rejected", "approved"].includes(story.stage))
    throw new Error("Resume an editable story before automatic production.");
  const eligible: Claim[] = story.claims.filter((claim) => {
    if (
      ![
        "supported fact",
        "attributed statement",
        "attributed reporting",
      ].includes(claim.status)
    )
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
    const supporting = claim.evidence
      .filter((e) => e.relation === "supports")
      .map((e) => story.sources.find((s) => s.id === e.sourceId))
      .filter((s): s is Source => !!s);
    const speaker = supporting.find((s) => s.kind === "primary")?.publisher;
    // Copy the checked finding verbatim; add only its recorded attribution.
    // An attributed statement that already names its original source reads as "The FBI said…".
    const text =
      claim.status === "attributed statement" && speaker
        ? namesSource(claim.text, speaker)
          ? claim.text
          : `According to ${speaker}, ${claim.text}`
        : claim.text;
    const count = text.split(/\s+/).length;
    if (words + count > NARRATION_LIMITS.max) continue;
    words += count;
    segments.push({ id: id(), text, claimIds: [claim.id] });
    if (segments.length === 8) break;
  }
  if (words < NARRATION_LIMITS.min)
    throw new Error(
      `Only ${words} usable narration words are supported; at least ${NARRATION_LIMITS.min} are required for a minute-long story. Add evidence and useful context; the bot will not pad the script.`,
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
    shotOverrides: undefined,
    format: narrationFormat(words),
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
      const held = qualityReleaseIssues(story, render).length > 0;
      flow.state = held ? "blocked" : "ready";
      flow.message = held
        ? "Preview available · automatic quality checks need attention"
        : "Private video passed automatic checks";
      await store.save(story, story.version);
      continue;
    }
    const rendering = flow.state === "rendering" && !!story.segments.length;
    if (
      !rendering &&
      !story.claims.length &&
      flow.method !== "evidence-backed"
    ) {
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
      kind: rendering
        ? "render"
        : flow.method === "evidence-backed"
          ? "construct"
          : "prepare",
      privatePreview: true,
      captions:
        rendering && flow.previewCaptions?.version === story.version
          ? flow.previewCaptions.provider
          : "estimated",
      tts:
        rendering && flow.previewNarration?.version === story.version
          ? flow.previewNarration.provider
          : "local",
      status: "queued",
      progress: rendering
        ? flow.previewNarration?.version === story.version &&
          flow.previewNarration.provider === "gemini"
          ? "Waiting for Gemini video render"
          : "Waiting for local video render"
        : flow.method === "evidence-backed"
          ? "Building a full evidence-backed story"
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
  const script = automaticScript(input);
  const photos = await discoverStoryMedia(script);
  const next = attachDiscoveredVisuals(script, photos);
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
  await store.addReport({
    id: id(),
    storyId: input.id,
    version: next.version,
    kind: "visuals",
    createdAt: now(),
    data: {
      summary: `${photos.assets.length} source photo(s), portraits and video clip(s) found.`,
      query: photos.query,
      candidates: photos.candidates,
      cautions: photos.warnings,
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
