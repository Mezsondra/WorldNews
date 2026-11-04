import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  parseSourceMedia,
  mediaIdentity,
  storeSourceMedia,
} from "../server/source-media.js";
import {
  peopleFocuses,
  commonsCandidate,
  attachDiscoveredVisuals,
} from "../server/media-discovery.js";
import { newStory, gates, previewGates } from "../server/domain.js";
import { dataDir } from "../server/db.js";
import { sourcePage } from "../server/source-page.js";
import { frame } from "../server/media.js";
import type { Source, Asset } from "../shared/types.js";
const source: Source = {
  id: "S",
  url: "https://news.example/report",
  title: "Binance hack prompts response",
  publisher: "News Desk",
  author: "Reporter",
  publishedAt: "2026-10-31",
  retrievedAt: "2026-11-01",
  text: "Binance co-CEO Richard Teng issued a statement.",
  hash: "h",
  language: "en",
  lineage: "news",
  kind: "secondary",
  usage: "test",
};
const html = `<h1>Binance hack prompts response</h1><script type="application/ld+json">${JSON.stringify(
  {
    "@type": "NewsArticle",
    headline: source.title,
    datePublished: source.publishedAt,
    image: {
      "@type": "ImageObject",
      url: "https://cdn.example/1440x810_portrait.jpg",
      caption: "Binance CEO Richard Teng speaking",
    },
    video: [
      {
        "@type": "VideoObject",
        name: "Binance hack report",
        contentUrl: "https://cdn.example/report.mp4",
        uploadDate: "2026-10-31",
      },
      {
        "@type": "VideoObject",
        name: "Unrelated election",
        contentUrl: "https://cdn.example/unrelated.mp4",
      },
    ],
  },
)}</script><figure><img src="https://cdn.example/800x450_portrait.jpg"><figcaption>Richard Teng <span class="copyright">Copyright</span><span class="credit">Jane Smith / Reuters</span></figcaption></figure><aside><figure><img src="https://cdn.example/election.jpg"><figcaption>Binance related sidebar</figcaption></figure></aside>`;
test("source media resolves crop variants, retains agency credits, and excludes unrelated videos/sidebar images", () => {
  const candidates = parseSourceMedia(html, source);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].credit, "Jane Smith / Reuters");
  assert.equal(candidates[0].people, true);
  assert.equal(candidates[1].kind, "video");
  assert.equal(
    candidates[1].captureDate,
    undefined,
    "upload date is not capture date",
  );
  assert(!candidates.some((c) => /unrelated|election/.test(c.url)));
  assert.equal(
    mediaIdentity(
      "https://cdn.example/?url=https%3A%2F%2Fimages.example%2Fportrait.jpg",
      source.url,
    ),
    "portrait.jpg",
  );
});
test("source extraction rejects error pages, unsafe URLs, logo images and video embed URLs", () => {
  assert.deepEqual(
    parseSourceMedia(
      html.replace(/Binance hack prompts response/g, "Access denied"),
      source,
    ),
    [],
  );
  const page = `<h1>${source.title}</h1><script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", image: ["http://127.0.0.1/private.jpg", "https://cdn.example/logo.png"], video: { "@type": "VideoObject", name: "Binance report", contentUrl: "https://video.example/embed/id" } })}</script>`;
  assert.deepEqual(parseSourceMedia(page, source), []);
});
test("unknown credits identify the publisher without assigning the article byline to the photograph", () => {
  const candidates = parseSourceMedia(
    html.replace('<span class="credit">Jane Smith / Reuters</span>', ""),
    source,
  );
  assert.match(candidates[0].credit, /Source: News Desk/);
  assert(!candidates[0].credit.includes("Reporter"));
});
test("stored source photos retain unknown capture dates, credits, hashes and final review gates", async () => {
  const story = newStory(source.title);
  story.sources = [source];
  const bytes = await sharp({
    create: { width: 800, height: 500, channels: 3, background: "#456" },
  })
    .jpeg()
    .toBuffer();
  try {
    const asset = await storeSourceMedia(
      story,
      parseSourceMedia(html, source)[0],
      async () => bytes,
    );
    assert.equal(asset.eventDate, "Capture date unconfirmed");
    assert.equal(asset.sourceMedia?.publishedAt, "2026-10-31");
    assert.equal(asset.sourceMedia?.reviewed, false);
    assert.match(asset.sourceMedia!.hash, /^[a-f0-9]{64}$/);
    story.assets = [asset];
    story.segments = [
      { id: "N", text: "Binance report", claimIds: [], assetId: asset.id },
    ];
    assert(gates(story).some((g) => g.code === "media-review"));
    assert(!previewGates(story).some((g) => g.code === "media-review"));
    assert.match(sourcePage(story, true), /Jane Smith \/ Reuters/);
    assert.match(sourcePage(story, true), /Capture date unconfirmed/);
    assert.match(
      frame(story, 0, 1920, bytes.toString("base64"), true),
      /Credit: Jane Smith/,
    );
  } finally {
    await rm(path.join(dataDir, "assets", story.id), {
      recursive: true,
      force: true,
    });
  }
});
test("scene refresh replaces discovered buildings, prioritizes clips, varies visuals, and preserves manual selections", () => {
  const story = newStory(source.title);
  const base: Asset = {
    id: "building",
    file: "b.png",
    creator: "A",
    permission: "CC",
    provenance: source.url,
    eventDate: "2020",
    location: "City",
    archive: true,
    context: "Building",
    discovery: {
      provider: "wikimedia",
      pageId: 1,
      title: "Building",
      sourceUrl: source.url,
      licenseUrl: source.url,
      downloadUrl: source.url,
      hash: "h",
      retrievedAt: "now",
      changes: "none",
      reviewed: false,
    },
  };
  const photo: Asset = {
    ...base,
    id: "portrait",
    subject: "Richard Teng",
    context: "Richard Teng archive portrait",
  };
  const clip: Asset = {
    ...base,
    id: "clip",
    mediaType: "video",
    poster: "p.png",
    sourceMedia: {
      sourceId: "S",
      title: "Binance hack",
      credit: "NBC News",
      publisher: "NBC News",
      downloadUrl: source.url,
      retrievedAt: "now",
      publishedAt: "2026-10-31",
      hash: "h",
      reviewed: false,
      changes: "muted",
    },
  };
  story.assets = [base, { ...base, id: "manual", discovery: undefined }];
  story.segments = [
    { id: "1", text: "Binance hack", claimIds: [], assetId: "building" },
    { id: "2", text: "Binance response", claimIds: [], assetId: "building" },
    { id: "3", text: "Manual", claimIds: [], assetId: "manual" },
  ];
  const updated = attachDiscoveredVisuals(story, {
    assets: [photo, clip],
    warnings: [],
    candidates: [],
    query: "",
  });
  assert.equal(updated.segments[0].assetId, "clip");
  assert.equal(updated.segments[1].assetId, "portrait");
  assert.equal(updated.segments[2].assetId, "manual");
});
test("portrait searches use named dossier actors and require their exact identity", () => {
  const story = newStory(source.title);
  story.sources = [source];
  const focuses = peopleFocuses(story);
  assert.equal(focuses[0].person, "Richard Teng");
  const page = {
    pageid: 3,
    title: "File:Richard Teng portrait.jpg",
    imageinfo: [
      {
        mime: "image/jpeg",
        url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/richard.jpg",
        extmetadata: {
          Artist: { value: "Jane Photographer" },
          ImageDescription: { value: "Portrait of Richard Teng, Binance CEO" },
          DateTimeOriginal: { value: "2024-01-01" },
          LicenseShortName: { value: "CC BY 4.0" },
          LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" },
        },
      },
    ],
  };
  assert.equal(commonsCandidate(page, focuses[0]).subject, "Richard Teng");
  assert.equal(focuses[0].affiliation, "Binance");
  assert.throws(
    () =>
      commonsCandidate(
        {
          ...page,
          imageinfo: [
            {
              ...page.imageinfo[0],
              extmetadata: {
                ...page.imageinfo[0].extmetadata,
                ImageDescription: {
                  value: "Richard Teng, an unrelated namesake",
                },
              },
            },
          ],
        },
        focuses[0],
      ),
    /organization/,
  );
  assert.throws(
    () =>
      commonsCandidate(
        {
          ...page,
          title: "File:Another Person.jpg",
          imageinfo: [
            {
              ...page.imageinfo[0],
              extmetadata: {
                ...page.imageinfo[0].extmetadata,
                ImageDescription: { value: "Another person" },
              },
            },
          ],
        },
        focuses[0],
      ),
    /named person/,
  );
});

test("a disguised playlist cannot be handed to the video decoder", async () => {
  const story = newStory(source.title);
  try {
    const candidate = parseSourceMedia(html, source).find(
      (c) => c.kind === "video",
    )!;
    await assert.rejects(
      () =>
        storeSourceMedia(story, candidate, async () =>
          Buffer.from("#EXTM3U\nfile:///private/data\n"),
        ),
      /not an MP4\/WebM container/,
    );
  } finally {
    await rm(path.join(dataDir, "assets", story.id), {
      recursive: true,
      force: true,
    });
  }
});
