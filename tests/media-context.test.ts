import test from "node:test";
import assert from "node:assert/strict";
import { mediaGeographyCompatible } from "../server/media-context.js";
import { planShots, assetMatchesNarration } from "../server/editorial-plan.js";
import { attachDiscoveredVisuals } from "../server/media-discovery.js";
import { visualFixture } from "./fixtures/visual-story.js";
import type { Asset } from "../shared/types.js";

const photo = (): Asset => ({
  id: "german-photo",
  file: "test.png",
  creator: "Photographer",
  permission: "Reuse pending",
  provenance: "https://example.org/photo",
  eventDate: "Capture date unknown",
  location: "Global",
  archive: true,
  context:
    "Fires were lit in the streets of Frankfurt during a nationwide protest by campaign group Gen Z regelt.",
  sourceMedia: {
    sourceId: "S",
    title: "Frankfurt nationwide youth protest in the streets",
    publisher: "Outlet",
    credit: "Photographer",
    downloadUrl: "https://example.org/photo.png",
    retrievedAt: "2026-11-03",
    hash: "h",
    publishedAt: "2026-10-31",
    reviewed: false,
    changes: "Resized",
  },
});

test("a country name in France 24 does not identify an Antarctic settlement", () => {
  const graphic = {
    ...photo(),
    graphic: true,
    location: "United States",
    context: "Original United States election explainer. Source: France 24.",
    sourceMedia: undefined,
  };
  assert(
    mediaGeographyCompatible(
      graphic,
      "According to France 24, Americans had voted in the United States.",
    ),
  );
  const german = {
    ...photo(),
    context: photo().context + " Source: France 24.",
  };
  assert(
    !mediaGeographyCompatible(
      german,
      "France's protests spread to more cities.",
    ),
  );
});

test("generic protest words cannot override conflicting French/German place context", () => {
  const asset = photo();
  const french =
    "France's protests were inspired by high school students protesting neglected school buildings.";
  assert.equal(mediaGeographyCompatible(asset, french), false);
  assert.equal(assetMatchesNarration(asset, french), false);
  assert.equal(
    mediaGeographyCompatible(
      asset,
      "German youth protests took place in more than 30 cities.",
    ),
    true,
  );
  assert.equal(
    mediaGeographyCompatible(asset, "Demonstrators gathered in Paris."),
    false,
  );
  assert.equal(
    mediaGeographyCompatible(asset, "Demonstrators gathered in Frankfurt."),
    true,
  );
});

test("discovery assignment and timed shots both reject conflicting media", () => {
  const story = visualFixture(),
    asset = photo();
  story.segments[0].text =
    "The French agency described street protests and the monitoring programme in France.";
  story.segments[0].assetId = asset.id;
  story.assets = [asset];
  const refreshed = attachDiscoveredVisuals(story, {
    assets: [],
    warnings: [],
    candidates: [],
    query: "",
  });
  assert.equal(refreshed.segments[0].assetId, undefined);
  const shots = planShots(
    story,
    [
      {
        segmentId: "N0",
        text: story.segments[0].text,
        claimIds: ["C0"],
        sourceIds: ["S"],
        start: 0,
        end: 16,
        narrationDuration: 16,
        narrationReused: false,
      },
    ],
    16,
  );
  assert(!shots.some((s) => s.assetId === asset.id));
});

test("unknown geography remains unverified rather than becoming event-location proof", () => {
  const asset = photo();
  asset.context = "A crowd in an unidentified location.";
  asset.sourceMedia!.title = "A crowd";
  assert.equal(
    mediaGeographyCompatible(asset, "Demonstrators gathered in France."),
    true,
  );
  assert.equal(asset.rights, undefined);
});
