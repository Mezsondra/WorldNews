import type { Job } from "../shared/types.js";
import { Store } from "./db.js";
import { productionGates, previewGates, now } from "./domain.js";
import {
  prepareAutomaticVideo,
  scheduleAutomaticVideos,
} from "./automation.js";
import { renderStory } from "./media.js";
import { addVisualsAndRebuild } from "./media-discovery.js";
import { constructStory } from "./story-construction.js";
export function startWorker(
  store: Store,
  options: { render?: typeof renderStory } = {},
) {
  let busy = false,
    stopped = false;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      await scheduleAutomaticVideos(store);
      const jobs = await store.jobs();
      for (const job of jobs.filter(
        (j) => j.status === "running" && j.lease < Date.now(),
      )) {
        // A paid request may have succeeded before a crash. Never retry it blindly.
        job.status = "failed";
        job.error =
          "Worker lease expired. Inspect existing outputs/provider usage before manually retrying.";
        job.progress = "Interrupted";
        await store.updateJob(job);
        const interrupted = await store.get(job.storyId);
        if (
          interrupted?.version === job.version &&
          interrupted.stage === "producing"
        ) {
          interrupted.stage = "drafting";
          await store.save(interrupted, interrupted.version);
        }
      }
      const job = jobs.find((j) => j.status === "queued");
      if (!job || !(await store.claimJob(job.id))) return;
      job.status = "running";
      job.attempts += 1;
      const heartbeat = setInterval(() => {
        job.lease = Date.now() + 120000;
        void store.updateJob(job).catch(console.error);
      }, 15000);
      try {
        const story = await store.get(job.storyId);
        if (!story || story.version !== job.version)
          throw new Error("Content version changed; render cancelled.");
        if (job.kind === "construct") {
          const result = await constructStory(store, job, {
            progress: async (message) => {
              job.progress = message;
              job.lease = Date.now() + 120000;
              await store.updateJob(job);
            },
          });
          job.status = "succeeded";
          job.progress =
            result.outcome === "ready"
              ? "Checked story ready; private video follows"
              : "Story held · inspect the construction report";
          return;
        }
        if (job.kind === "media") {
          await addVisualsAndRebuild(store, story);
          job.status = "succeeded";
          job.progress =
            "Source photos and clips saved; video rebuild follows automatically";
          return;
        }
        if (job.kind === "prepare") {
          await prepareAutomaticVideo(store, story);
          job.status = "succeeded";
          job.progress =
            "Source-linked script saved; video follows automatically";
          return;
        }
        const issues = job.privatePreview
          ? previewGates(story)
          : productionGates(story);
        if (issues.length) throw new Error(issues[0].message);
        const result = await (options.render || renderStory)(
          story,
          async (progress) => {
            const active = (await store.jobs()).find((j) => j.id === job.id);
            if (active?.status === "cancelled")
              throw new Error("Render cancelled after a content edit.");
            job.progress = progress;
            job.lease = Date.now() + 120000;
            await store.updateJob(job);
          },
          store,
          job.privatePreview
            ? {
                tts: job.tts || "local",
                captions: job.captions || "estimated",
                privatePreview: true,
              }
            : {},
        );
        const latest = await store.get(story.id);
        if (!latest || latest.version !== story.version)
          throw new Error(
            "Output belongs to an old version; approval remains invalid.",
          );
        latest.renders = latest.renders
          .filter((r) => r.version !== story.version)
          .concat(result);
        latest.stage = "awaiting-review";
        const qualityHeld = result.quality?.status !== "passed";
        if (latest.automation) {
          latest.automation.state = qualityHeld ? "blocked" : "ready";
          latest.automation.message = qualityHeld
            ? "Preview available · held by automatic quality checks. Inspect the report before continuing."
            : "Private video passed automatic checks. Editorial review remains before final production.";
        }
        latest.updatedAt = now();
        await store.save(latest, story.version);
        await store.snapshot(latest);
        job.status = "succeeded";
        job.progress = qualityHeld
          ? "Preview available · quality checks need attention"
          : "Automatic checks passed · ready for editorial review";
        await store.audit("render-complete", {
          storyId: story.id,
          version: story.version,
          duration: result.duration,
          quality: result.quality?.status,
        });
      } catch (error) {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : "Render failed";
        job.progress = "Needs attention";
        const story = await store.get(job.storyId);
        if (story?.version === job.version && story.automation) {
          story.automation.state = "blocked";
          story.automation.message = job.error;
          await store.save(story, story.version);
        }
        if (story?.version === job.version && story.stage === "producing") {
          story.stage = "drafting";
          await store.save(story, story.version);
        }
      } finally {
        clearInterval(heartbeat);
        job.lease = 0;
        await store.updateJob(job);
      }
    } catch (error) {
      console.error(
        "Worker error:",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 1500);
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
