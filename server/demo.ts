import { Store } from "./db.js";
import { retrieve } from "./fetcher.js";
import { id, newStory } from "./domain.js";
const store = new Store(process.env.DATABASE_URL);
await store.init();
if ((await store.list()).some((s) => s.demo)) {
  console.log("Historical demo already exists; no duplicate created.");
  await store.close();
  process.exit();
}
const story = newStory("Europa Clipper begins its journey to Jupiter");
story.demo = true;
story.category = "Science";
story.region = "Space";
story.eventAt = "2024-10-14T16:06:00Z";
story.summary =
  "A historical sample: NASA’s spacecraft sets out to investigate whether Europa could support life. This is a source-linked workflow demonstration, not breaking news.";
console.log("Retrieving original NASA sources…");
for (const url of [
  "https://science.nasa.gov/blogs/europa-clipper/2024/10/14/signal-acquired-nasas-europa-clipper-begins-journey-to-jovian-system-2/",
  "https://science.nasa.gov/mission/europa-clipper/mission-faq/",
  "https://science.nasa.gov/mission/europa-clipper/",
]) {
  const source = await retrieve(url);
  source.publisher = "NASA";
  source.lineage = "NASA";
  source.kind = "primary";
  source.language = "en";
  story.sources.push(source);
}
const definitions = [
  [
    0,
    "launched on a SpaceX Falcon Heavy rocket from NASA Kennedy’s Launch Complex 39A in Florida at 12:06 p.m. EDT.",
    "In its October 2024 launch report, NASA said Europa Clipper lifted off from Florida aboard a SpaceX Falcon Heavy rocket. The agency identified Kennedy Space Center as the launch site.",
  ],
  [
    1,
    "Europa Clipper is not a life detection mission",
    "NASA describes an important limit to the mission: Europa Clipper is not designed to detect life. Its investigation asks a different question about the conditions on this distant moon.",
  ],
  [
    1,
    "determine whether there are places below Europa’s surface that could support life",
    "According to the agency, the central science question is whether locations beneath Europa’s surface could support life. Finding conditions that might support life would not by itself establish that life exists.",
  ],
  [
    2,
    "49 close flybys of Europa",
    "NASA’s mission overview describes a plan for forty nine close flybys of Europa. These encounters are part of an investigation of the moon, rather than a landing on its surface.",
  ],
  [
    2,
    "orbit Jupiter",
    "The agency says the spacecraft will orbit Jupiter. That distinction matters: the mission overview places the spacecraft around the planet, with close approaches to Europa as it gathers observations.",
  ],
];
for (let i = 0; i < definitions.length; i++) {
  const [sourceIndex, passage, narration] = definitions[i] as [
    number,
    string,
    string,
  ];
  const source = story.sources[sourceIndex];
  if (!source.text.includes(passage))
    throw new Error(
      `NASA wording changed. Review the demo fixture before seeding: ${passage}`,
    );
  const claimId = `C${i + 1}`;
  story.claims.push({
    id: claimId,
    text: narration,
    status: "attributed statement",
    reviewed: false,
    evidence: [{ sourceId: source.id, passage, relation: "supports" }],
  });
  story.segments.push({ id: id(), text: narration, claimIds: [claimId] });
}
story.stage = "drafting";
await store.create(story);
console.log(
  `Created historical demo ${story.id}. Check each claim in the dashboard before rendering.`,
);
await store.close();
