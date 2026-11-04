import { newStory, now } from "../../server/domain.js";
import type { Story } from "../../shared/types.js";

export function visualFixture(): Story {
  const story = newStory(
    "Visual pipeline test — fictional monitoring programme",
  );
  story.category = "Test fixture";
  story.eventAt = "2026-11-01";
  const passages = [
    "The fictional agency announced a water-monitoring programme in Poland on November 1, 2026. On December 1, 2026, the agency plans to publish its first measurements.",
    "The fictional agency said researchers in Germany will compare measurements from 18 monitoring sites. The programme is intended to establish a baseline rather than prove that every waterway is safe.",
    "According to the fictional agency, the results will be published alongside the measurement method and the limitations of the work. The agency says that individual samples cannot describe conditions everywhere.",
    "The fictional agency says the programme remains a plan, rather than a completed scientific finding. Researchers will still need to collect observations and explain what the measurements can and cannot establish before drawing broader conclusions about water quality. The agency also says that the first results will need to be read with their collection dates and sampling locations. A comparison across different sites may help researchers ask further questions, but the programme announcement does not claim that such a comparison has already been completed.",
  ];
  story.sources = [
    {
      id: "S",
      url: "https://example.invalid/fictional-fixture",
      title: "Fictional monitoring programme — saved test excerpt",
      publisher: "Fictional Test Agency",
      author: "Test fixture",
      publishedAt: "2026-11-01",
      retrievedAt: now(),
      hash: "fictional-hash",
      text: passages.join("\n\n"),
      language: "en",
      lineage: "Test fixture",
      kind: "primary",
      usage: "Synthetic fixture; not factual reporting",
    },
  ];
  story.claims = passages.map((passage, i) => ({
    id: `C${i}`,
    text: passage,
    status: "attributed statement",
    reviewed: false,
    evidence: [{ sourceId: "S", passage, relation: "supports" }],
  }));
  story.segments = passages.map((text, i) => ({
    id: `N${i}`,
    text,
    claimIds: [`C${i}`],
  }));
  return story;
}
