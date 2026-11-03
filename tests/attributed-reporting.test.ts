import test from "node:test";
import assert from "node:assert/strict";
import {
  newStory,
  now,
  gates,
  previewGates,
  attributesReporting,
} from "../server/domain.js";
import { validateDraft } from "../server/providers.js";
import { automaticScript } from "../server/automation.js";
import type { Story } from "../shared/types.js";

function fixture(): Story {
  const story = newStory("Opposition protests");
  story.format = "brief";
  const passage =
    "India’s opposition parties staged major protests in New Delhi on Sunday against Prime Minister Narendra Modi’s government and a nationwide voter list review that has fuelled demonstrations since the summer, led by the youth movement Cockroach Janta Party.";
  story.sources = [
    {
      id: "S1",
      publisher: "France 24",
      url: "https://example.org/report",
      title: story.title,
      author: "Reporter",
      publishedAt: "2026-11-01",
      retrievedAt: now(),
      hash: "snapshot",
      text: passage,
      language: "en",
      kind: "secondary",
      lineage: "France 24",
      usage: "Fixture",
    },
  ];
  story.claims = [
    "According to France 24, India’s opposition parties staged major protests in New Delhi on Sunday against the government of Prime Minister Narendra Modi.",
    "France 24 reports that the protests also targeted a nationwide review of voter lists, which has fuelled demonstrations since the summer.",
    "According to France 24, the demonstrations have been led by a youth movement called the Cockroach Janta Party.",
  ].map((text, i) => ({
    id: `c${i + 1}`,
    text: Array(3).fill(text).join(" "),
    status: "attributed reporting",
    reviewed: false,
    evidence: [{ sourceId: "S1", passage, relation: "supports" }],
  }));
  story.segments = story.claims.map((c, i) => ({
    id: `s${i + 1}`,
    text: c.text,
    claimIds: [c.id],
  }));
  return story;
}
const draft = (s: Story) => ({
  outcome: "draft",
  reason: "Outlet-attributed brief",
  summary: "Protests reported by France 24.",
  claims: s.claims,
  segments: s.segments,
});

test("single-outlet reporting supports a minute-long private draft with explicit spoken attribution, without source promotion or approval", () => {
  const story = fixture();
  assert.deepEqual(previewGates(story), []);
  assert(gates(story).some((g) => g.code === "review"));
  assert(gates(story).some((g) => g.code === "date"));
  assert.equal(validateDraft(story, draft(story)).format, "explainer");
  const next = automaticScript(story);
  assert.deepEqual(previewGates(next), []);
  assert.deepEqual(next.sources, story.sources);
  assert(next.claims.every((c) => !c.reviewed));
  assert(next.segments.every((s) => s.text.includes("France 24")));
  assert.equal(next.approval, undefined);
});

test("each segment using an outlet-attributed claim must attribute the same supporting outlet", () => {
  const story = fixture();
  story.segments.push({
    id: "later",
    text: "The protests targeted a review of voter lists.",
    claimIds: ["c2"],
  });
  assert(
    gates(story).some(
      (g) => g.code === "attribution" && g.message.includes("later"),
    ),
  );
  assert.throws(
    () => validateDraft(story, draft(story)),
    /name the supporting outlet/,
  );
  story.segments.pop();
  story.claims[0].text = "The opposition protested in New Delhi.";
  assert(gates(story).some((g) => g.code === "attribution"));
  story.claims[0].text =
    "According to Another Outlet, the opposition protested in New Delhi.";
  assert(gates(story).some((g) => g.code === "attribution"));
});

test("news credits and passing mentions cannot replace explicit reporting attribution", () => {
  assert(
    attributesReporting(
      "According to France 24, protests took place.",
      "France 24",
    ),
  );
  assert(attributesReporting("FRANCE 24 REPORTED protests.", "France 24"));
  assert(
    attributesReporting(
      "A report: News (World). reports protests.",
      "News (World).",
    ),
  );
  assert(
    !attributesReporting(
      "France 24 filmed the building. Protests took place.",
      "France 24",
    ),
  );
  assert(
    !attributesReporting(
      "According to France 240, protests took place.",
      "France 24",
    ),
  );
  assert(
    !attributesReporting("According to France 24, protests took place.", ""),
  );
});

test("draft preflight catches mistaken original statements and uncorroborated facts before applying them", () => {
  const story = fixture();
  story.claims[0].status = "attributed statement";
  assert.throws(() => validateDraft(story, draft(story)), /original source/);
  assert(gates(story).some((g) => g.code === "original"));
  story.claims[0].status = "supported fact";
  assert.throws(
    () => validateDraft(story, draft(story)),
    /independent evidence/,
  );
});

test("outlet attribution retains exact-passage, contradiction and translation checks", () => {
  const story = fixture();
  story.claims[0].evidence[0].passage = "Invented quotation";
  assert(gates(story).some((g) => g.code === "passage"));
  assert.throws(() => validateDraft(story, draft(story)), /untraceable/);
  story.claims[0].evidence[0].passage = story.sources[0].text;
  story.claims[0].evidence.push({
    ...story.claims[0].evidence[0],
    relation: "contradicts",
  });
  assert.throws(
    () => validateDraft(story, draft(story)),
    /contradictory evidence/,
  );
  story.claims[0].evidence.pop();
  story.sources[0].language = "fr";
  assert.throws(() => validateDraft(story, draft(story)), /translation/);
});
