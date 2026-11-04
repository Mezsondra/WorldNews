import { visualFixture } from "./visual-story.js";
export function extendedVisualFixture() {
  const story = visualFixture();
  story.title = "Fictional test — comparisons, sequences and quotations";
  const texts = [
    "The agency said the number of monitoring sites increased from 18 in 2024 to 24 in 2025. Both values refer to the same fictional programme and use the same counting method. The comparison describes site counts rather than measurements of water quality.",
    "The agency describes the following sequence. First, researchers collect water samples. Next, researchers test the samples. Finally, researchers publish the findings. These are the steps stated in the fictional source rather than an independently verified description of completed work.",
    'Director Rivera said: "We will publish the method alongside every measurement." The fictional statement supplies that quotation and names its speaker. The words describe a stated intention, rather than evidence that publication has already happened.',
    "The agency says the programme remains limited to the locations and periods covered by its measurements. Researchers will need to preserve the collection dates, sampling method and uncertainty when they interpret the findings. The statement does not establish that every waterway is safe or that any particular cause explains the results.",
  ];
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
  return story;
}
