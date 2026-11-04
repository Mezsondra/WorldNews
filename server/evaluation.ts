import type { Story } from "../shared/types.js";
import { gates, previewGates, wordCount } from "./domain.js";
import { planEvidenceVisuals } from "./visual-plan.js";
import { editorialIssues } from "./editorial-check.js";
import { mediaRightsIssues } from "./media-rights.js";
import { qualityReleaseIssues } from "./video-quality.js";

export function evaluateStories(
  stories: Story[],
  asOf = new Date().toISOString(),
) {
  return {
    asOf,
    scope:
      "Read-only evaluation of saved evidence and structural gates. This is not an independent factual audit, a freshness check, a BBC/CNN/DW quality score or publication approval.",
    stories: stories.map((story) => {
      const input = { ...story, renders: [] };
      const issues = previewGates(input);
      const plan = planEvidenceVisuals(input);
      const checked =
        !!story.editorial?.check && !editorialIssues(story).length;
      const render = story.renders.find((r) => r.version === story.version);
      return {
        id: story.id,
        version: story.version,
        title: story.title,
        words: wordCount(story),
        sourceCount: story.sources.length,
        eventAt: story.eventAt,
        previewEligible: issues.length === 0,
        previewIssues: [...new Set(issues.map((g) => g.message))],
        finalIssues: [...new Set(gates(input).map((g) => g.message))],
        completePackageCheckCurrent: checked,
        metadataWarning: checked
          ? undefined
          : "Headline, publishing text and on-screen assertions do not have a current complete-package check.",
        eligibleVisualTypes: [...new Set(plan.map((v) => v.kind))],
        visualChoices: plan.length,
        explicitOriginRecords: story.sources.filter(
          (s) => s.origin && s.origin.kind !== "unknown",
        ).length,
        assetsWithPublicUseGaps: story.assets.filter(
          (a) => mediaRightsIssues(a, "public-video").length,
        ).length,
        currentExport: render
          ? {
              quality: render.quality?.status || "not-checked",
              qualityIssues: qualityReleaseIssues(story, render),
              duration: render.duration,
              narration: render.production?.narrationDuration,
              privatePreview: !!render.privatePreview,
              visualCoverage: render.visualCoverage?.percent,
            }
          : undefined,
      };
    }),
  };
}
export function evaluationMarkdown(report: ReturnType<typeof evaluateStories>) {
  const escape = (s: string) => s.replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
  return `# Saved-story evaluation\n\nAs of ${report.asOf}.\n\n${report.scope}\n\n| Story | Words | Sources | Private preview gate | Available graphics | Current package check |\n|---|---:|---:|---|---|---|\n${report.stories.map((s) => `| ${escape(s.title)} · v${s.version} | ${s.words} | ${s.sourceCount} | ${s.previewEligible ? "Pass" : "Held"} | ${s.eligibleVisualTypes.join(", ") || "None"} | ${s.completePackageCheckCurrent ? "Recorded" : "Needs check"} |`).join("\n")}\n\n${report.stories.map((s) => `## ${s.title}\n\n${s.previewIssues.length ? s.previewIssues.map((reason) => `- ${reason}`).join("\n") : "Saved evidence passes the structural private-preview gates; measured speech and output checks still apply."}\n\n${s.metadataWarning || "The recorded automated package check is provisional; editorial review remains pending."}\n`).join("\n")}`;
}
