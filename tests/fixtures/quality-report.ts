import type { Story, Render } from "../../shared/types.js";
import { QUALITY_STANDARD } from "../../shared/quality.js";
import { qualityFingerprint } from "../../server/video-quality.js";

// For workflow/approval unit tests that deliberately stub rendering. Real-file
// checks are exercised separately; this fixture is never a quality evaluation.
export function stubQualityReport(story: Story, render: Render) {
  render.quality = {
    standard: QUALITY_STANDARD.version,
    fingerprint: qualityFingerprint(story, render),
    checkedAt: new Date().toISOString(),
    status: "passed",
    findings: [],
    repairs: [],
    measurements: {
      narrationSeconds: 70,
      visualCoverage: 100,
      captionCues: 1,
      maxCaptionCps: 15,
      decoded: true,
    },
  };
  return render;
}
