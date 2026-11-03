import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { visualFixture } from "./fixtures/visual-story.js";
import {
  planEvidenceVisuals,
  visualPlanIssues,
} from "../server/visual-plan.js";
import {
  extraClauseVisuals,
  processVisuals,
} from "../server/explanatory-facts.js";
import { planShots } from "../server/editorial-plan.js";
import { evidenceGraphic } from "../server/visual-graphics.js";

const comparison =
  "The agency said the number of sites increased from 18 in 2024 to 24 in 2025.";
const sequence =
  "First, researchers collect water samples. Next, researchers test the samples. Finally, researchers publish the findings.";
const quotation =
  'Director Rivera said: "We will publish the method alongside every measurement."';
export const ref = (passage: string) => ({
  sourceId: "S",
  claimId: "C0",
  passage,
});

test("charts require an exact same-unit temporal comparison, preserve counts and do not calculate a trend", () => {
  const result = extraClauseVisuals("N", comparison, [ref(comparison)]);
  const chart = result.find((v) => v.kind === "chart")!;
  assert(chart.kind === "chart");
  assert.deepEqual(chart.items, [
    { label: "2024", value: 18, displayedValue: "18" },
    { label: "2025", value: 24, displayedValue: "24" },
  ]);
  assert.equal(chart.unit, "sites");
  assert(!JSON.stringify(chart).includes("33%"));
  for (const bad of [
    comparison.replace("18", "about 18"),
    comparison.replace("increased", "did not increase"),
    "The agency reported $18 million of spending and $24 million of revenue.",
    comparison.replace("2025", "2024"),
    comparison.replace("18", "-18"),
    "Sites increased from 18 in 2024 to 24 percent in 2025.",
  ]) {
    assert(
      !extraClauseVisuals("N", bad, [ref(bad)]).some((v) => v.kind === "chart"),
      bad,
    );
  }
  assert(
    !extraClauseVisuals("N", comparison.replace("24", "25"), [
      ref(comparison),
    ]).some((v) => v.kind === "chart"),
  );
});

test("processes retain explicit source order and never infer a mechanism from ordinary paragraphs", () => {
  const process = processVisuals("N", sequence, [ref(sequence)])[0];
  assert(process.kind === "process");
  assert.equal(process.steps.length, 3);
  assert(process.steps[2].startsWith("Finally,"));
  assert.deepEqual(
    processVisuals("N", sequence, [
      ref(sequence.replace("First,", "Yesterday,")),
    ]),
    [],
  );
  assert.deepEqual(
    processVisuals(
      "N",
      sequence.replace("test the samples", "approve the results"),
      [ref(sequence)],
    ),
    [],
  );
  assert.deepEqual(
    processVisuals(
      "N",
      "Measurements were collected. Findings were published.",
      [ref(sequence)],
    ),
    [],
  );
});

test("quoted text needs an explicitly named speaker in both evidence and narration", () => {
  const quote = extraClauseVisuals("N", quotation, [ref(quotation)]).find(
    (v) => v.kind === "quote",
  )!;
  assert(quote.kind === "quote");
  assert.equal(quote.speaker, "Director Rivera");
  assert.equal(
    quote.quote,
    "We will publish the method alongside every measurement.",
  );
  assert(
    !extraClauseVisuals("N", quotation.replace("Rivera", "Jones"), [
      ref(quotation),
    ]).some((v) => v.kind === "quote"),
  );
  assert(
    !extraClauseVisuals("N", quotation.replace("every", "all"), [
      ref(quotation),
    ]).some((v) => v.kind === "quote"),
  );
  assert(
    !extraClauseVisuals(
      "N",
      '"We will publish the method alongside every measurement."',
      [ref('"We will publish the method alongside every measurement."')],
    ).some((v) => v.kind === "quote"),
  );
});

test("all three new graphics enter automatic plans, rasterize, and reject changed payloads", async () => {
  const story = visualFixture();
  const texts = [comparison, sequence, quotation];
  story.sources[0].text = texts.join("\n\n");
  story.claims = texts.map((text, i) => ({
    id: `C${i}`,
    text,
    status: "attributed statement",
    reviewed: false,
    evidence: [{ sourceId: "S", passage: text, relation: "supports" }],
  }));
  story.segments = texts.map((text, i) => ({
    id: `N${i}`,
    text,
    claimIds: [`C${i}`],
  }));
  const plan = planEvidenceVisuals(story);
  const scenes = story.segments.map((s, i) => ({
    segmentId: s.id,
    text: s.text,
    claimIds: s.claimIds,
    sourceIds: ["S"],
    start: i * 16,
    end: (i + 1) * 16,
    narrationDuration: 16,
    narrationReused: false,
  }));
  const shots = planShots(story, scenes, 48);
  for (const kind of ["chart", "process", "quote"]) {
    const visual = plan.find((v) => v.kind === kind)!;
    assert(visual, kind);
    assert(
      shots.some((s) => s.kind === kind),
      kind,
    );
    const svg = evidenceGraphic(story, visual);
    const metadata = await sharp(Buffer.from(svg)).metadata();
    assert.equal(metadata.height, 1920);
    assert((await sharp(Buffer.from(svg)).png().toBuffer()).length > 1000);
  }
  const altered = structuredClone(shots);
  const chart = altered.find((s) => s.kind === "chart")!.visual!;
  if (chart.kind === "chart") chart.items[0].value = 19;
  assert(visualPlanIssues(story, altered).length);
  const quote = plan.find((v) => v.kind === "quote")!;
  if (quote.kind === "quote") quote.speaker = "<script>";
  assert(!evidenceGraphic(story, quote).includes("<script>"));
});
