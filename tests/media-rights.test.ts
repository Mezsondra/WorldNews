import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Asset, Render } from "../shared/types.js";
import {
  recordMediaRights,
  mediaRightsIssues,
  assetCredit,
  publicMediaRights,
} from "../server/media-rights.js";
import { gates, previewGates } from "../server/domain.js";
import { visualFixture } from "./fixtures/visual-story.js";
import { assetMatchesNarration } from "../server/editorial-plan.js";
import { sourcePage } from "../server/source-page.js";
import { Store, dataDir } from "../server/db.js";
import { createApp } from "../server/app.js";
import { renderStory } from "../server/media.js";
import type { AddressInfo } from "node:net";

const asset = (): Asset => ({
  id: "A",
  file: "assets/test.png",
  creator: "Test Photographer",
  permission: "CC BY 4.0",
  provenance: "https://example.org/original",
  eventDate: "2024-01-01",
  location: "Poland",
  archive: true,
  context: "Archive monitoring sites in Poland",
  discovery: {
    provider: "wikimedia",
    pageId: 1,
    title: "Monitoring sites",
    sourceUrl: "https://example.org/original",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    downloadUrl: "https://example.org/test.png",
    hash: "h",
    retrievedAt: "2026-11-03",
    changes: "Resized",
    reviewed: true,
  },
});
const decision = () => ({
  status: "cleared",
  basis: "license",
  holder: "Test Photographer",
  evidence:
    "The original file page identifies this creator and the CC BY 4.0 license.",
  evidenceUrl: "https://private.example/permission-record",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  allowedUses: ["private-preview", "public-video"],
  commercialUse: true,
  adaptations: true,
  credit: "Test Photographer · CC BY 4.0",
  changes: "Resized and cropped to the portrait layout",
  restrictions: "Retain attribution and license link",
  shareAlikePlan: "",
  contextChecked: true,
  reviewedBy: "Test Editor",
});

test("context review and nonempty permission strings do not clear final media reuse", () => {
  const a = asset();
  assert.deepEqual(mediaRightsIssues(a, "private-preview"), []);
  assert(mediaRightsIssues(a, "public-video").length);
  const story = visualFixture();
  story.assets = [a];
  story.segments[0].assetId = a.id;
  assert(gates(story).some((g) => g.code === "media-rights"));
  assert(!previewGates(story).some((g) => g.code === "media-rights"));
  a.rights = recordMediaRights(a, decision());
  assert.deepEqual(mediaRightsIssues(a, "public-video"), []);
  assert(!gates(story).some((g) => g.code === "media-rights"));
  assert.equal(assetCredit(a), decision().credit);
  const expired = structuredClone(a);
  expired.rights!.expiresAt = "2000-01-01T00:00:00.000Z";
  assert(mediaRightsIssues(expired, "public-video").length);
  assert(mediaRightsIssues(expired, "private-preview").length);
});

test("clearance records need scoped documented permission and are invalidated by media/context changes", () => {
  const a = asset();
  for (const change of [
    { evidence: "yes" },
    { contextChecked: false },
    { adaptations: false },
    { commercialUse: false },
    { reviewedBy: "" },
    { basis: "unconfirmed" },
    { allowedUses: ["private-preview"] },
    { allowedUses: ["public-video"] },
    { licenseUrl: undefined },
  ]) {
    assert.throws(() => recordMediaRights(a, { ...decision(), ...change }));
  }
  a.rights = recordMediaRights(a, decision());
  for (const mutate of [
    (x: Asset) => {
      x.graphic = true;
    },
    (x: Asset) => {
      x.graphicNarration = ["Different narration"];
    },
    (x: Asset) => {
      x.context += " Different event";
    },
    (x: Asset) => {
      x.discovery!.hash = "changed";
    },
    (x: Asset) => {
      x.contentHash = "new bytes";
    },
    (x: Asset) => {
      x.archive = false;
    },
  ]) {
    const changed = structuredClone(a);
    mutate(changed);
    assert(mediaRightsIssues(changed, "public-video").length);
  }
});

test("blocked media cannot enter private shots and restricted media stays within its recorded scope", () => {
  const a = asset();
  a.rights = recordMediaRights(a, { ...decision(), status: "blocked" });
  assert(mediaRightsIssues(a, "private-preview").length);
  assert(!assetMatchesNarration(a, "Monitoring sites in Poland"));
  const story = visualFixture();
  story.assets = [a];
  story.segments[0].assetId = a.id;
  assert(previewGates(story).some((g) => g.code === "media-blocked"));
  a.rights = recordMediaRights(a, {
    ...decision(),
    status: "restricted",
    allowedUses: ["private-preview"],
  });
  assert.deepEqual(mediaRightsIssues(a, "private-preview"), []);
  assert(mediaRightsIssues(a, "public-video").length);
});

test("license conditions cannot be erased by a confirmation click or an incompatible clearance", () => {
  const a = asset();
  a.discovery!.licenseUrl = "https://creativecommons.org/licenses/by-nc/4.0/";
  assert.throws(() => recordMediaRights(a, decision()), /conflicts/);
  a.discovery!.licenseUrl = "https://creativecommons.org/licenses/by-sa/4.0/";
  assert.throws(() => recordMediaRights(a, decision()), /ShareAlike/);
  a.rights = recordMediaRights(a, {
    ...decision(),
    shareAlikePlan:
      "The adapted image will retain the original CC BY-SA license and the source record will link it.",
    licenseUrl: a.discovery!.licenseUrl,
  });
  assert.deepEqual(mediaRightsIssues(a, "public-video"), []);
});

test("public source records expose attribution and use limits while private evidence stays private", () => {
  const a = asset();
  a.rights = recordMediaRights(a, decision());
  const story = visualFixture();
  story.assets = [a];
  story.renders = [
    { version: story.version, shots: [{ assetId: a.id }] } as Render,
  ];
  assert(sourcePage(story, false).includes(a.rights.credit));
  assert(!sourcePage(story, false).includes("private.example"));
  assert(!sourcePage(story, false).includes(a.rights.evidence));
  assert(sourcePage(story, true).includes("private.example"));
  assert(
    !JSON.stringify(publicMediaRights(a.rights)).includes("private.example"),
  );
  assert(
    !JSON.stringify(publicMediaRights(a.rights)).includes(decision().evidence),
  );
});

test("HTTP context review preserves original license text and rights records bind to actual bytes in a new revision", async () => {
  const story = visualFixture(),
    a = asset();
  a.sourceMedia = {
    sourceId: "S",
    title: "Fixture source photo",
    publisher: "Test outlet",
    credit: "Test Photographer",
    downloadUrl: "https://example.org/test.png",
    retrievedAt: "2026-11-03",
    hash: "h",
    publishedAt: "2024-01-01",
    reviewed: false,
    changes: "Resized",
  };
  a.file = `assets/${story.id}/rights-fixture.png`;
  story.assets = [a];
  const file = path.join(dataDir, a.file);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#234" },
    })
      .png()
      .toBuffer(),
  );
  const store = new Store(undefined, ":memory:");
  await store.init();
  await store.create(story);
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/stories/${story.id}/assets/A`;
  const patch = (suffix: string, body: unknown) =>
    fetch(url + suffix, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await patch("/review", { version: 1, reviewed: true })).status,
      200,
    );
    assert.equal(
      (await store.get(story.id))!.assets[0].permission,
      "CC BY 4.0",
    );
    assert.equal(
      (await patch("/rights", { version: 1, decision: decision() })).status,
      409,
    );
    assert.equal(
      (
        await patch("/rights", {
          version: 2,
          decision: { ...decision(), evidence: "yes" },
        })
      ).status,
      422,
    );
    assert.equal(
      (await patch("/rights", { version: 2, decision: decision() })).status,
      200,
    );
    const saved = (await store.get(story.id))!;
    assert.equal(saved.version, 3);
    assert.match(saved.assets[0].contentHash!, /^[a-f0-9]{64}$/);
    assert.deepEqual(mediaRightsIssues(saved.assets[0], "public-video"), []);
    assert.equal((await store.costs()).length, 0);
    assert.equal(
      saved.claims.every((c) => !c.reviewed),
      true,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await store.close();
    await rm(path.dirname(file), { recursive: true, force: true });
  }
});

test("rendering rejects asset bytes changed after a documented decision before narration", async () => {
  const story = visualFixture(),
    a = asset();
  a.file = `assets/${story.id}/changed.png`;
  a.contentHash = "0".repeat(64);
  const file = path.join(dataDir, a.file);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#234" },
    })
      .png()
      .toBuffer(),
  );
  a.rights = recordMediaRights(a, decision());
  story.assets = [a];
  story.segments[0].assetId = a.id;
  try {
    await assert.rejects(
      () =>
        renderStory(story, async () => {}, undefined, {
          tts: "local",
          captions: "estimated",
          privatePreview: true,
        }),
      /bytes changed/,
    );
  } finally {
    await rm(path.dirname(file), { recursive: true, force: true });
    await rm(path.join(dataDir, "renders", story.id), {
      recursive: true,
      force: true,
    });
  }
});
