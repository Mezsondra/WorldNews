import type { Story, RenderedShot } from "../shared/types.js";
import { visualReadingSeconds } from "../shared/visuals.js";
import { planEvidenceVisuals } from "./visual-plan.js";

// One selective pass. Only a current exact-clause graphic can replace a text
// fallback; no new facts, media downloads or evidence expansion happens here.
export function repairVisualFallbacks(story: Story, shots: RenderedShot[]) {
  const plan = planEvidenceVisuals(story);
  const replaced: string[] = [];
  const output = shots.map((shot) => {
    if (!["fact", "sources"].includes(shot.kind)) return shot;
    const visual = plan.find(
      (v) =>
        v.segmentId === shot.segmentId &&
        v.narration === shot.narration &&
        shot.end - shot.start >= visualReadingSeconds(v.kind),
    );
    if (!visual) return shot;
    replaced.push(shot.id);
    return {
      ...shot,
      kind: visual.kind,
      visualId: visual.id,
      visual,
      assetId: undefined,
      videoStart: undefined,
      purpose: visual.purpose,
      label: `${visual.kind} · ${visual.narration}`,
    };
  });
  return { shots: output, replaced };
}
