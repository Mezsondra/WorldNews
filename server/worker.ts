import type { Job } from "../shared/types.js";
import { Store } from "./db.js";
import { gates, now } from "./domain.js";
import { renderStory } from "./media.js";
export function startWorker(store: Store) {
  let busy = false,
    stopped = false;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
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
        const issues = gates(story);
        if (issues.length) throw new Error(issues[0].message);
        const result = await renderStory(story, async (progress) => {
          const active = (await store.jobs()).find((j) => j.id === job.id);
          if (active?.status === "cancelled")
            throw new Error("Render cancelled after a content edit.");
          job.progress = progress;
          job.lease = Date.now() + 120000;
          await store.updateJob(job);
        });
        const latest = await store.get(story.id);
        if (!latest || latest.version !== story.version)
          throw new Error(
            "Output belongs to an old version; approval remains invalid.",
          );
        latest.renders = latest.renders
          .filter((r) => r.version !== story.version)
          .concat(result);
        latest.stage = "awaiting-review";
        latest.updatedAt = now();
        await store.save(latest, story.version);
        await store.snapshot(latest);
        job.status = "succeeded";
        job.progress = "Ready for editorial review";
        await store.audit("render-complete", {
          storyId: story.id,
          version: story.version,
          duration: result.duration,
        });
      } catch (error) {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : "Render failed";
        job.progress = "Needs attention";
        const story = await store.get(job.storyId);
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
