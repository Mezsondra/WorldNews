import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { newStory, gates, previewGates } from "../server/domain.js";
import { dataDir } from "../server/db.js";
import {
  commonsCandidate,
  visualFocus,
  visualFocuses,
  headlineSubjects,
  discoverVisuals,
  attachDiscoveredVisuals,
  plainMetadata,
} from "../server/media-discovery.js";
import { validateWikimediaImageUrl } from "../server/fetcher.js";
import { frame } from "../server/media.js";
import { sourcePage } from "../server/source-page.js";
const page = () => ({
  pageid: 123,
  index: 1,
  title: "File:Polish Constitutional Tribunal building.jpg",
  imageinfo: [
    {
      mime: "image/jpeg",
      thumburl:
        "https://upload.wikimedia.org/wikipedia/commons/a/ab/tribunal.jpg",
      extmetadata: {
        Artist: {
          value: '<a href="https://example.org">Test Photographer</a>',
        },
        ImageDescription: {
          value:
            "Entrance to the building of the Polish Constitutional Tribunal in Warsaw",
        },
        DateTimeOriginal: { value: "2016-01-22 13:18:31" },
        LicenseShortName: { value: "CC BY-SA 3.0 pl" },
        LicenseUrl: {
          value: "https://creativecommons.org/licenses/by-sa/3.0/pl/deed.en",
        },
        Restrictions: { value: "" },
      },
    },
  ],
});
const focus = () => visualFocus(newStory("Poland Constitutional Crisis"));

test("Commons images retain creator/date/license/context and remain archive-labelled and unreviewed", () => {
  const candidate = commonsCandidate(page(), focus());
  assert.equal(candidate.creator, "Test Photographer");
  assert.equal(candidate.eventDate, "2016-01-22");
  assert.equal(candidate.archive, true);
  assert.equal(candidate.discovery?.reviewed, false);
  assert.match(candidate.permission, /CC BY-SA/);
  assert.match(candidate.context, /does not depict the current/);
  assert.match(candidate.discovery!.changes, /ShareAlike/);
});
test("visual discovery excludes wrong country, old protests, missing metadata and unsupported licenses", () => {
  const unrelated = page();
  unrelated.title = "File:Constitutional Court of Korea building.jpg";
  unrelated.imageinfo[0].extmetadata.ImageDescription.value =
    "Building of the Constitutional Court of Korea";
  assert.throws(() => commonsCandidate(unrelated, focus()), /relevant Polish/);
  const protest = page();
  protest.title = "File:Polish Tribunal protest 2015.jpg";
  assert.throws(() => commonsCandidate(protest, focus()), /Event\/portrait/);
  for (const field of ["Artist", "DateTimeOriginal"]) {
    const missing = page();
    missing.imageinfo[0].extmetadata[field as "Artist"].value = "";
    assert.throws(() => commonsCandidate(missing, focus()), /Creator|date/);
  }
  const noncommercial = page();
  noncommercial.imageinfo[0].extmetadata.LicenseShortName.value =
    "CC BY-NC 4.0";
  assert.throws(
    () => commonsCandidate(noncommercial, focus()),
    /supported reuse/,
  );
  const mismatch = page();
  mismatch.imageinfo[0].extmetadata.LicenseUrl.value =
    "https://creativecommons.org/licenses/by/3.0/";
  assert.throws(() => commonsCandidate(mismatch, focus()), /disagree/);
});
test("image download allowlist blocks off-domain URLs, credentials, private networks and insecure schemes", () => {
  for (const url of [
    "http://upload.wikimedia.org/wikipedia/commons/a.jpg",
    "https://upload.wikimedia.org.evil.example/wikipedia/commons/a.jpg",
    "https://127.0.0.1/wikipedia/commons/a.jpg",
    "https://key:secret@upload.wikimedia.org/wikipedia/commons/a.jpg",
    "https://upload.wikimedia.org/private/a.jpg",
  ])
    assert.throws(() => validateWikimediaImageUrl(url));
  assert.equal(
    validateWikimediaImageUrl(
      "https://thumb.wikimedia.org/wikipedia/commons/a.jpg?utm_source=x#test",
    ).href,
    "https://thumb.wikimedia.org/wikipedia/commons/a.jpg",
  );
  assert.equal(
    plainMetadata("<script>steal()</script><b>Author</b>"),
    "Author",
  );
});
test("bounded free photo discovery stores raster assets, links scenes, and preserves manually assigned visuals", async () => {
  const story = newStory("Poland Constitutional Crisis");
  story.segments = [
    { id: "one", text: "Narration", claimIds: ["C"] },
    { id: "two", text: "Narration", claimIds: ["C"], assetId: "manual" },
  ];
  const buffer = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#668877" },
  })
    .jpeg()
    .toBuffer();
  let downloads = 0;
  try {
    const result = await discoverVisuals(
      story,
      async (url, options) => {
        const u = new URL(String(url));
        assert.equal(u.hostname, "commons.wikimedia.org");
        assert.equal(u.searchParams.get("gsrlimit"), "12");
        assert.equal(options?.redirect, "error");
        return new Response(JSON.stringify({ query: { pages: [page()] } }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      async () => {
        downloads++;
        return buffer;
      },
    );
    assert.equal(downloads, 1);
    assert.equal(result.assets.length, 1);
    const next = attachDiscoveredVisuals(story, result);
    assert.equal(next.segments[0].assetId, result.assets[0].id);
    assert.equal(next.segments[1].assetId, "manual");
    const credits = sourcePage(next, true);
    assert.match(credits, /Visual credits/);
    assert.match(credits, /Test Photographer/);
    assert.match(credits, /creativecommons.org/);
    assert.match(credits, /Resized/);
    const svg = frame(
      { ...next, segments: [next.segments[0]] },
      0,
      1920,
      buffer.toString("base64"),
      true,
    );
    assert.match(svg, /ARCHIVE PHOTO/);
    assert.match(svg, /CC BY-SA/);
    assert.match(svg, /height="560"/);
    assert(!svg.includes('opacity=".86"'));
  } finally {
    await rm(path.join(dataDir, "assets", story.id), {
      recursive: true,
      force: true,
    });
  }
});
test("discovered images require explicit media review for final production", () => {
  const story = newStory("Poland Constitutional Crisis"),
    candidate = commonsCandidate(page(), focus());
  story.format = "brief";
  story.assets = [{ ...candidate, id: "A", file: "test.png" }];
  story.sources = [
    {
      id: "S",
      url: "https://example.org",
      title: "Source",
      publisher: "Source",
      author: "Author",
      publishedAt: "2026-10-30",
      retrievedAt: "2026-10-31",
      hash: "hash",
      text: "The agency announced a programme.",
      language: "en",
      lineage: "Agency",
      kind: "primary",
      usage: "Fixture",
    },
  ];
  story.claims = [
    {
      id: "C",
      text: "The agency announced a programme.",
      status: "attributed statement",
      reviewed: false,
      evidence: [
        { sourceId: "S", passage: story.sources[0].text, relation: "supports" },
      ],
    },
  ];
  story.segments = [
    {
      id: "N",
      text: Array(7)
        .fill("The agency announced a programme at its centre today.")
        .join(" "),
      claimIds: ["C"],
      assetId: "A",
    },
  ];
  assert(gates(story).some((g) => g.code === "media-review"));
  assert(!previewGates(story).some((g) => g.code === "media-review"));
  story.assets[0].discovery!.reviewed = true;
  assert(!gates(story).some((g) => g.code === "media-review"));
});

test("headline subjects give one neutral place search each; people, events and details are rejected", () => {
  assert.deepEqual(
    headlineSubjects(
      "FBI says North Korea behind $6 billion Binance crypto theft",
    ),
    ["FBI", "North Korea", "Binance"],
  );
  assert.deepEqual(
    headlineSubjects("Flooding forces evacuations in Valencia region"),
    ["Valencia"],
  );
  assert.deepEqual(
    headlineSubjects("Binance Resumes Withdrawals After Record Hack"),
    [],
  );
  assert.deepEqual(headlineSubjects("US midterms: what is at stake"), []);
  const story = newStory(
    "FBI says North Korea behind $6 billion Binance crypto theft",
  );
  const focuses = visualFocuses(story);
  assert.equal(focuses.length, 3);
  assert.ok(focuses.every((f) => f.place));
  assert.equal(
    visualFocuses(newStory("Poland Constitutional Crisis")).length,
    1,
  );
  const korea = focuses[1];
  const photo = (title: string, description: string) => {
    const p = page();
    p.title = title;
    p.imageinfo[0].extmetadata.ImageDescription.value = description;
    return p;
  };
  const ok = commonsCandidate(
    photo(
      "File:North Korea - Ryugyong hotel.jpg",
      "Ryugyong Hotel skyline, Pyongyang, North Korea",
    ),
    korea,
  );
  assert.equal(ok.location, "North Korea");
  assert.ok(ok.archive);
  for (const [title, description, reason] of [
    ["File:Seoul skyline.jpg", "Skyline of Seoul, South Korea", /subject/],
    ["File:North Korean leader.jpg", "Leader of North Korea", /neutral/],
    [
      "File:Pyongyang parade.jpg",
      "Military parade in front of a building, North Korea",
      /neutral/,
    ],
    [
      "File:Third floor of hotel facade.jpg",
      "Hotel in Pyongyang, North Korea",
      /detail/,
    ],
  ] as const)
    assert.throws(
      () => commonsCandidate(photo(title, description), korea),
      reason,
    );
});
