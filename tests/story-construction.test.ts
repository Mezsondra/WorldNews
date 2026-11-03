import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/db.js";
import { createApp } from "../server/app.js";
import {
  newStory,
  now,
  gates,
  previewGates,
  invalidate,
} from "../server/domain.js";
import {
  constructStory,
  constructionCandidate,
  constructionDiagnostics,
  checkConstructionCandidate,
  queueStoryConstruction,
} from "../server/story-construction.js";
import { evidenceCatalog } from "../server/research.js";
import {
  editorialAssertions,
  editorialIssues,
  packageFingerprint,
  quantities,
} from "../server/editorial-check.js";
import {
  independentOrigins,
  originGraphIssues,
} from "../server/source-origins.js";
import { scheduleAutomaticVideos } from "../server/automation.js";
import { usedReportingSources } from "../server/production-record.js";
import { renderStory } from "../server/media.js";
import { sourcePage } from "../server/source-page.js";
import { CONSTRUCTION_POLICY } from "../shared/construction.js";
import type { Job, Source, Story } from "../shared/types.js";
import type { Fetcher } from "../server/providers.js";

process.env.PILOT_API_ENABLED = "true";
process.env.PILOT_BUDGET_USD = "5";
process.env.ANTHROPIC_API_KEY = "test-only-construction";
process.env.MEDIA_DISCOVERY_ENABLED = "false";
const response = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
const noMedia = async () => ({
  assets: [],
  candidates: [],
  warnings: [],
  query: "No network in tests",
});
const paragraphs = [
  "The agency says it has announced a water-monitoring programme across 18 sites. Researchers will collect samples from rivers and compare the results using a published method. The announcement describes the planned work and does not report completed findings about water quality.",
  "The agency says its researchers will use the same sampling procedure at each location. Teams will record when and where samples are collected so that later comparisons can account for differences between locations and conditions during the monitoring programme.",
  "The agency describes the programme as an effort to improve the information available about local rivers. Its statement says the planned measurements will be published with notes about the collection method, allowing readers to understand how the results were obtained.",
  "The agency has not announced the results of this monitoring work. The statement describes the programme rather than a conclusion about the condition of any river. The planned publications will provide further information when the researchers complete their measurements.",
];

function fixture(): Story {
  const story = newStory("Agency announces water monitoring");
  story.eventAt = "2026-11-01";
  story.sources = [
    {
      id: "S1",
      title: "Monitoring programme announcement",
      publisher: "Agency",
      url: "https://agency.example/programme",
      text: paragraphs.join("\n\n"),
      kind: "primary" as const,
      lineage: "Agency",
    },
    {
      id: "S2",
      title: "Observer records programme announcement",
      publisher: "Observer",
      url: "https://observer.example/programme",
      text: "The observer recorded the agency announcement. The statement concerns a planned water-monitoring programme, rather than completed findings.",
      kind: "secondary" as const,
      lineage: "Observer",
    },
  ].map((s) => ({
    ...s,
    author: "Press office",
    publishedAt: "2026-11-01",
    retrievedAt: now(),
    hash: `hash-${s.id}`,
    language: "en",
    usage: "Fictional test fixture",
  }));
  return story;
}

function draft(story = fixture()) {
  const refs = evidenceCatalog(story.sources)
    .filter((p) => p.sourceId === "S1")
    .map((p) => ({
      sourceId: p.sourceId,
      passageId: p.id,
      relation: "supports",
    }));
  return {
    outcome: "draft",
    reason:
      "The supplied announcement supports a complete attributed explainer.",
    gaps: [],
    headline: {
      text: "Agency announces a water-monitoring programme",
      claimIds: ["C0"],
    },
    summary: {
      text: "The agency describes its planned monitoring work and how it will publish the measurements.",
      claimIds: ["C0", "C2"],
    },
    publishing: {
      text: "The agency has announced a water-monitoring programme. Its statement describes planned measurements, rather than completed water-quality findings.",
      claimIds: ["C0", "C3"],
    },
    onScreen: [{ id: "sites", text: "18 monitoring sites", claimIds: ["C0"] }],
    claims: paragraphs.map((text, i) => ({
      id: `C${i}`,
      text,
      status: "attributed statement",
      evidence: refs,
    })),
    segments: paragraphs.map((text, i) => ({
      id: `N${i}`,
      text,
      claimIds: [`C${i}`],
      beat: ["development", "mechanism", "context", "uncertainty"][i],
    })),
  };
}

function holdDraft() {
  const empty = { text: "Further research is needed", claimIds: [] };
  return {
    outcome: "needs-research",
    reason: "Useful background is missing.",
    gaps: [
      "Find the original programme method and its documented limitations.",
    ],
    headline: empty,
    summary: empty,
    publishing: empty,
    onScreen: [],
    claims: [],
    segments: [],
  };
}

function checker(input: any) {
  return {
    summary: "The passages support the attributed programme description.",
    gaps: [],
    sources: input.sources.map((s: any) => ({
      sourceId: s.id,
      kind: s.id === "S1" ? "primary" : "secondary",
      origin: {
        kind: "original",
        key: s.publisher,
        parentSourceIds: [],
        explanation:
          "Provisional origin assessment from the supplied document.",
      },
    })),
    assertions: input.assertions.map((a: any) => ({
      id: a.id,
      verdict: "supported",
      reason: "The selected passages support this attributed description.",
      evidence: a.allowedEvidence,
    })),
  };
}

function checkFor(story: Story, value: unknown = draft(story)) {
  const candidate = constructionCandidate(story, value, story.sources);
  const catalog = evidenceCatalog(story.sources);
  return {
    candidate,
    checked: checker({
      sources: story.sources,
      assertions: editorialAssertions(candidate).map((a) => ({
        ...a,
        allowedEvidence: catalog
          .filter((p) =>
            candidate.claims
              .filter((c) => a.claimIds.includes(c.id))
              .some((c) =>
                c.evidence.some(
                  (e) => e.sourceId === p.sourceId && e.passage === p.text,
                ),
              ),
          )
          .map((p) => ({ sourceId: p.sourceId, passageId: p.id })),
      })),
    }),
  };
}

async function setup(story = fixture()) {
  const store = new Store(undefined, ":memory:");
  await store.init();
  await store.create(story);
  const job = await queueStoryConstruction(store, story);
  return { store, story, job };
}

function transport(
  options: {
    firstNeedsResearch?: boolean;
    rejectHeadline?: boolean;
    fail?: boolean;
    beforeReply?: () => Promise<void>;
    searchResults?: string[];
  } = {},
) {
  const counts = { writers: 0, checkers: 0, searches: 0, total: 0 };
  const request: Fetcher = async (_url, init) => {
    counts.total++;
    if (options.fail)
      return new Response("Sensitive provider body", { status: 500 });
    const body = JSON.parse(String(init?.body));
    const input = JSON.parse(body.messages[0].content);
    let content: unknown[];
    if (body.tools[0].name === "web_search") {
      counts.searches++;
      assert.equal(body.tools[0].max_uses, 2);
      content = [
        {
          type: "server_tool_use",
          name: "web_search",
          input: { query: "original monitoring method" },
        },
        {
          type: "web_search_tool_result",
          content: (options.searchResults || []).map((url) => ({
            type: "web_search_result",
            url,
            title: "Context source",
          })),
        },
      ];
    } else if (String(body.system).includes("Write an original")) {
      counts.writers++;
      // Mock passages use the exact catalog IDs from the request, including after context retrieval.
      const value = draft();
      const refs = input.sources
        .filter((s: any) => s.id === "S1")
        .flatMap((s: any) =>
          s.passages.map((p: any) => ({
            sourceId: s.id,
            passageId: p.id,
            relation: "supports",
          })),
        );
      value.claims.forEach((c) => {
        c.evidence = refs;
      });
      content = [
        {
          type: "tool_use",
          name: "story_result",
          input:
            options.firstNeedsResearch && counts.writers === 1
              ? holdDraft()
              : value,
        },
      ];
    } else {
      counts.checkers++;
      const value = checker(input);
      if (options.rejectHeadline) {
        const headline = value.assertions.find((a: any) => a.id === "headline");
        headline.verdict = "unsupported";
        headline.reason = "The headline overstates the linked evidence.";
      }
      content = [{ type: "tool_use", name: "story_result", input: value }];
    }
    await options.beforeReply?.();
    return response({
      id: `mock-${counts.total}`,
      usage: { input_tokens: 1000, output_tokens: 500 },
      content,
    });
  };
  return { request, counts };
}

test("construction checks every output surface, and later wording/source edits invalidate the exact package", () => {
  const story = fixture();
  const { candidate, checked } = checkFor(story);
  const result = checkConstructionCandidate(
    candidate,
    checked,
    story.sources,
    "report",
  );
  assert.deepEqual(result.issues, []);
  assert.deepEqual(editorialIssues(result.story), []);
  assert.deepEqual(previewGates(result.story), []);
  assert(gates(result.story).some((g) => g.code === "review"));
  assert(gates(result.story).some((g) => g.code === "provenance"));
  assert(result.story.claims.every((c) => !c.reviewed));
  assert(result.story.sources.every((s) => !s.research?.metadataReviewed));
  const visualRevision = invalidate(result.story);
  visualRevision.pronunciations = { Agency: "ay gen see" };
  assert.equal(
    packageFingerprint(visualRevision),
    packageFingerprint(result.story),
  );
  for (const change of [
    (s: Story) => {
      s.title = "Agency proves all rivers are safe";
    },
    (s: Story) => {
      s.segments[0].text += " No further monitoring is needed.";
    },
    (s: Story) => {
      s.editorial!.onScreen[0].text = "All rivers safe";
    },
    (s: Story) => {
      s.editorial!.publishing.text += " The programme has already concluded.";
    },
    (s: Story) => {
      s.sources[0].origin!.key = "Different origin";
    },
    (s: Story) => {
      s.sources[0].author = "A different spokesperson";
    },
    (s: Story) => {
      s.sources[0].title = "Corrected source title";
    },
    (s: Story) => {
      s.sources[0].text += " Updated statement.";
    },
  ]) {
    const changed = structuredClone(result.story);
    change(changed);
    assert(editorialIssues(changed).length);
    assert(previewGates(changed).some((g) => g.code === "editorial-package"));
  }
});

test("quantities and direct quotations must agree with the specific linked passages", () => {
  assert.deepEqual(quantities("$6.3 billion and 18 percent"), [
    "6300000000",
    "18%",
  ]);
  assert.deepEqual(quantities("six billion"), ["6000000000"]);
  assert.deepEqual(quantities("two hundred and fifty"), ["250"]);
  const story = fixture();
  for (const field of ["headline", "summary", "publishing"] as const) {
    const value = draft(story);
    value[field].text = "The agency announced 19 monitoring sites.";
    assert.throws(
      () => constructionCandidate(story, value, story.sources),
      /quantities 19/,
    );
  }
  const quote = draft(story);
  quote.onScreen[0].text = 'The agency said "All rivers are safe".';
  assert.throws(
    () => constructionCandidate(story, quote, story.sources),
    /direct quotation/,
  );
});

test("missing checker assertions, unrelated evidence and unsupported headlines cannot pass", () => {
  const story = fixture();
  const { candidate, checked } = checkFor(story);
  const missing = structuredClone(checked);
  missing.assertions.pop();
  assert.throws(
    () => checkConstructionCandidate(candidate, missing, story.sources, "r"),
    /omitted or duplicated/,
  );
  const unrelated = structuredClone(checked);
  unrelated.assertions[0].evidence = [{ sourceId: "S2", passageId: "P2-1" }];
  assert.throws(
    () => checkConstructionCandidate(candidate, unrelated, story.sources, "r"),
    /unrelated evidence/,
  );
  const unsupported = structuredClone(checked);
  unsupported.assertions[0].verdict = "unsupported";
  assert(
    checkConstructionCandidate(
      candidate,
      unsupported,
      story.sources,
      "r",
    ).issues.some((s) => s.includes("headline")),
  );
});

test("padding and repeated identifiers are rejected before a separate paid checker call", () => {
  const story = fixture();
  const padded = draft(story);
  padded.segments[1].text =
    padded.segments[0].text + " This is the same account.";
  assert.throws(
    () => constructionCandidate(story, padded, story.sources),
    /Repeated narration sentences/,
  );
  const duplicate = draft(story);
  duplicate.claims[1].id = duplicate.claims[0].id;
  assert.throws(
    () => constructionCandidate(story, duplicate, story.sources),
    /existing claim references|must be unique/,
  );
});

test("a stale package cannot reach narration, and source pages expose the complete checked package", async () => {
  const story = fixture();
  const { candidate, checked } = checkFor(story);
  const result = checkConstructionCandidate(
    candidate,
    checked,
    story.sources,
    "report",
  ).story;
  const html = sourcePage(result, true);
  assert(html.includes("Complete story package"));
  assert(html.includes(result.editorial!.publishing.text));
  assert(html.includes("Origin: original"));
  result.title = "An unsupported stronger headline";
  await assert.rejects(
    () => renderStory(result, async () => {}),
    /changed|separate evidence check/,
  );
});

test("the separate checker cannot invent source parents or turn a cycle into independent evidence", () => {
  const story = fixture();
  const { candidate, checked } = checkFor(story);
  checked.sources[0].origin.parentSourceIds = ["not-attached"];
  checked.sources[0].origin.kind = "derived";
  assert.throws(
    () => checkConstructionCandidate(candidate, checked, story.sources, "r"),
    /unknown parent/,
  );
  checked.sources[0].origin.parentSourceIds = ["S2"];
  checked.sources[1].origin.kind = "derived";
  checked.sources[1].origin.parentSourceIds = ["S1"];
  assert.throws(
    () => checkConstructionCandidate(candidate, checked, story.sources, "r"),
    /cycle/,
  );
});

test("origin relationships merge wire copies, parent chains, identical snapshots and same-host variants", () => {
  const base = fixture().sources[0];
  const sources: Source[] = [
    {
      ...base,
      id: "wire",
      origin: {
        kind: "original",
        key: "Reuters",
        parentSourceIds: [],
        explanation: "Original wire",
      },
    },
    {
      ...base,
      id: "copy",
      hash: "copy-hash",
      url: "https://publisher.example/report",
      origin: {
        kind: "derived",
        key: "REUTERS.",
        parentSourceIds: ["wire"],
        explanation: "Wire syndication",
      },
    },
    {
      ...base,
      id: "other",
      hash: "other-hash",
      url: "https://other.example/report",
      origin: {
        kind: "original",
        key: "Independent reporting",
        parentSourceIds: [],
        explanation: "Distinct reporting",
      },
    },
  ];
  assert.equal(independentOrigins(sources, ["wire", "copy"]).length, 1);
  assert.equal(
    independentOrigins(sources, ["wire", "copy", "other"]).length,
    2,
  );
  sources[2].hash = sources[0].hash;
  assert.equal(independentOrigins(sources, ["wire", "other"]).length, 1);
  sources[2].hash = "other-hash";
  sources[2].url = "https://www.agency.example/another";
  assert.equal(independentOrigins(sources, ["wire", "other"]).length, 1);
  sources[2].url = "https://other.example/report";
  sources[2].origin!.kind = "unknown";
  assert.equal(independentOrigins(sources, ["wire", "other"]).length, 1);
  sources[0].origin = {
    kind: "derived",
    key: "Reuters",
    parentSourceIds: ["copy"],
    explanation: "Invalid circular account",
  };
  assert(originGraphIssues(sources).some((s) => s.includes("cycle")));
});

test("a formatting error cannot hide evidence errors from the same bounded repair feedback", () => {
  const story = fixture();
  const value = draft(story);
  value.summary.text = "An overlong summary. ".repeat(15);
  value.headline.text = "Agency confirms 999 sites";
  const issues = constructionDiagnostics(story, value, story.sources);
  assert(issues.some((i) => i.includes("summary.text")));
  assert(issues.some((i) => i.includes("999")));
  assert.throws(() => constructionCandidate(story, value, story.sources));
});

test("secondary-report attribution is checked before a paid package-check call", () => {
  const story = fixture(),
    value = draft(story);
  value.claims[0].status = "attributed reporting";
  value.claims[0].text = "According to Agency, " + value.claims[0].text;
  value.segments[0].text = "According to Agency, " + value.segments[0].text;
  assert.throws(
    () => constructionCandidate(story, value, story.sources),
    /name the supporting outlet/,
  );
});

test("outlet-name numerals do not become unsupported facts or license separate unsupported quantities", () => {
  const story = fixture();
  story.sources[0].publisher = "France 24";
  const value = draft(story);
  value.headline.text = "France 24 reports a monitoring programme";
  assert.doesNotThrow(() => constructionCandidate(story, value, story.sources));
  value.headline.text = "France 24 reports 24 monitoring sites";
  assert.throws(
    () => constructionCandidate(story, value, story.sources),
    /quantities 24/,
  );
});

test("English paraphrases cannot manufacture evidence, quantities or explanatory visuals", () => {
  const story = fixture();
  const value = draft(story);
  (value.claims[0].evidence[0] as any).translation =
    "The agency confirmed 999 sites.";
  value.headline.text = "The agency confirmed 999 sites";
  assert.throws(
    () => constructionCandidate(story, value, story.sources),
    /English source omit translation/,
  );
  const candidate = constructionCandidate(story, draft(story), story.sources);
  candidate.claims[0].evidence[0].translation =
    "The agency confirmed 999 sites.";
  candidate.title = candidate.editorial!.headline.text =
    "The agency confirmed 999 sites";
  assert(editorialIssues(candidate).some((i) => i.includes("999")));
  assert(previewGates(candidate).some((g) => g.code === "translation"));
});

test("related-story navigation is excluded from supplied evidence while saved snapshots stay intact", () => {
  const source = fixture().sources[0];
  source.text =
    "The agency announced the water programme. Read more Read less Unrelated election result 999 seats.";
  assert(evidenceCatalog([source]).every((p) => !p.text.includes("999")));
  assert(source.text.includes("999"));
});

test("the durable construction job prepares an unchecked revision and rendering follows without another click", async () => {
  const { store, job } = await setup();
  const mock = transport();
  try {
    const result = await constructStory(store, job, {
      request: mock.request,
      discoverMedia: noMedia,
      measureNarration: async () => 70,
    });
    assert.equal(result.outcome, "ready");
    assert.equal(result.story.version, 2);
    assert.equal(result.story.automation?.state, "rendering");
    assert.equal(result.story.approval, undefined);
    assert.deepEqual(editorialIssues(result.story), []);
    assert.deepEqual(mock.counts, {
      writers: 1,
      checkers: 1,
      searches: 0,
      total: 2,
    });
    assert.equal((await store.costs()).length, 1);
    const cost = (await store.costs())[0];
    assert.equal(cost.operation, "story-construction");
    assert.equal(cost.usage?.completedCalls, 2);
    assert(
      cost.actualUsd !== undefined &&
        cost.actualUsd < CONSTRUCTION_POLICY.allowanceUsd,
    );
    await store.updateJob({ ...job, status: "succeeded" });
    await scheduleAutomaticVideos(store);
    assert(
      (await store.jobs()).some(
        (j) => j.kind === "render" && j.version === 2 && j.privatePreview,
      ),
    );
    assert.equal((await store.reports(job.storyId))[0].data.state, "ready");
  } finally {
    await store.close();
  }
});

test("short measured speech gets one supported repair within the same reservation and is held if still short", async () => {
  const { store, job } = await setup();
  const mock = transport();
  let measurements = 0;
  try {
    const result = await constructStory(store, job, {
      request: mock.request,
      discoverMedia: noMedia,
      measureNarration: async () => {
        measurements++;
        return 55;
      },
    });
    assert.equal(result.outcome, "hold");
    assert.equal(measurements, 2);
    assert.deepEqual(mock.counts, {
      writers: 2,
      checkers: 2,
      searches: 1,
      total: 5,
    });
    assert.equal((await store.costs()).length, 1);
    assert.match(result.story.automation!.message, /measured minute/);
    assert.equal((result.report.data.narrationChecks as unknown[]).length, 2);
    assert.equal(result.story.renders.length, 0);
  } finally {
    await store.close();
  }
});

test("a duration repair rechecks all assertions and preserves unchecked human review flags", async () => {
  const { store, job } = await setup();
  const mock = transport();
  let measured = 0;
  try {
    const result = await constructStory(store, job, {
      request: mock.request,
      discoverMedia: noMedia,
      measureNarration: async () => (++measured === 1 ? 55 : 70),
    });
    assert.equal(result.outcome, "ready");
    assert.equal(mock.counts.checkers, 2);
    assert.equal(mock.counts.total, 5);
    assert(result.story.claims.every((c) => !c.reviewed));
    assert.deepEqual(editorialIssues(result.story), []);
  } finally {
    await store.close();
  }
});

test("thin findings trigger one real-result-only context pass, preserve snapshots and stop within two drafts", async () => {
  const { store, job } = await setup();
  const mock = transport({
    firstNeedsResearch: true,
    searchResults: [
      "http://127.0.0.1/private",
      "https://context.example/method",
      "https://context.example/duplicate",
      "https://context.example/extra",
      "https://context.example/third",
      "https://context.example/fifth",
    ],
  });
  const fetched: string[] = [];
  try {
    const result = await constructStory(store, job, {
      request: mock.request,
      discoverMedia: noMedia,
      measureNarration: async () => 70,
      fetchSource: async (url) => {
        fetched.push(url);
        const s = fixture().sources[1];
        return {
          ...s,
          id: `context-${fetched.length}`,
          url,
          hash: url.endsWith("duplicate")
            ? fixture().sources[0].hash
            : `new-hash-${fetched.length}`,
          text: "A documented account of the programme method and its limitations.",
        };
      },
    });
    assert.equal(result.outcome, "ready");
    assert.deepEqual(mock.counts, {
      writers: 2,
      checkers: 1,
      searches: 1,
      total: 4,
    });
    assert.equal(fetched.length, 4);
    assert(fetched.every((url) => !url.includes("127.0.0.1")));
    assert.equal((await store.researchSources(job.id)).length, 3);
    assert.equal(result.story.sources.length, 5);
    assert.deepEqual(editorialIssues(result.story), []);
    assert(
      result.story.sources
        .slice(0, 3)
        .every((s) => !s.research?.metadataReviewed),
    );
  } finally {
    await store.close();
  }
});

test("an unresolved separate check holds the story rather than rendering or looping", async () => {
  const { store, job, story } = await setup();
  const mock = transport({ rejectHeadline: true });
  try {
    const result = await constructStory(store, job, {
      request: mock.request,
      discoverMedia: noMedia,
      measureNarration: async () => 70,
    });
    assert.equal(result.outcome, "hold");
    assert.equal(result.story.automation?.state, "blocked");
    assert.equal(result.story.version, story.version);
    assert.deepEqual(result.story.segments, story.segments);
    assert.equal(mock.counts.writers, 2);
    assert.equal(mock.counts.checkers, 2);
    await store.updateJob({ ...job, status: "succeeded" });
    await scheduleAutomaticVideos(store);
    assert(!(await store.jobs()).some((j) => j.kind === "render"));
  } finally {
    await store.close();
  }
});

test("uncertain transport failure does not retry, spend twice or replace a story", async () => {
  const { store, job } = await setup();
  const mock = transport({ fail: true });
  try {
    await assert.rejects(
      () =>
        constructStory(store, job, {
          request: mock.request,
          discoverMedia: noMedia,
          measureNarration: async () => 70,
        }),
      /HTTP 500/,
    );
    assert.equal(mock.counts.total, 1);
    await assert.rejects(
      () =>
        constructStory(store, job, {
          request: mock.request,
          discoverMedia: noMedia,
          measureNarration: async () => 70,
        }),
      /already attempted/,
    );
    assert.equal(mock.counts.total, 1);
    assert.equal((await store.costs()).length, 1);
    assert.equal((await store.costs())[0].state, "uncertain");
    assert.equal((await store.get(job.storyId))!.version, 1);
  } finally {
    await store.close();
  }
});

test("concurrent edits preserve returned provider work but prevent stale application", async () => {
  const { store, job } = await setup();
  const mock = transport({
    beforeReply: async () => {
      const current = (await store.get(job.storyId))!;
      await store.save(
        invalidate({
          ...current,
          title: "Edited while construction was running",
        }),
        current.version,
      );
    },
  });
  try {
    await assert.rejects(
      () =>
        constructStory(store, job, {
          request: mock.request,
          discoverMedia: noMedia,
          measureNarration: async () => 70,
        }),
      /changed during construction/,
    );
    assert.equal(
      (await store.get(job.storyId))!.title,
      "Edited while construction was running",
    );
    assert((await store.reports(job.storyId))[0].data.lastResponse);
    assert.equal(mock.counts.total, 1);
  } finally {
    await store.close();
  }
});

test("construction admission is versioned, deduplicated and bounded by the existing allowance", async () => {
  const { store, job } = await setup();
  try {
    const current = (await store.get(job.storyId))!;
    assert.equal((await queueStoryConstruction(store, current)).id, job.id);
    assert.equal((await store.jobs()).length, 1);
    await store.updateJob({ ...job, status: "succeeded" });
    await store.query(
      "UPDATE pilot_budget SET reserved_micros=limit_micros WHERE id=?",
      ["pilot"],
    );
    await assert.rejects(
      async () =>
        queueStoryConstruction(store, (await store.get(job.storyId))!),
      /existing allowance/,
    );
    assert.equal((await store.costs()).length, 0);
  } finally {
    await store.close();
  }
});

test("budget exhaustion after queueing blocks the worker before any provider request", async () => {
  const { store, job } = await setup();
  const mock = transport();
  try {
    await store.query(
      "UPDATE pilot_budget SET reserved_micros=limit_micros WHERE id=?",
      ["pilot"],
    );
    await assert.rejects(
      () =>
        constructStory(store, job, {
          request: mock.request,
          discoverMedia: noMedia,
          measureNarration: async () => 70,
        }),
      /ceiling reached/,
    );
    assert.equal(mock.counts.total, 0);
    assert.equal((await store.get(job.storyId))!.version, 1);
    assert.equal((await store.costs())[0].state, "blocked");
  } finally {
    await store.close();
  }
});

test("new dossiers can opt into construction after research without a second button", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  const story = fixture();
  story.claims = [];
  story.segments = [];
  story.automation = {
    enabled: true,
    method: "evidence-backed",
    state: "waiting-research",
    message: "Research finished",
    warnings: [],
  };
  try {
    await store.create(story);
    await scheduleAutomaticVideos(store);
    await scheduleAutomaticVideos(store);
    const jobs = await store.jobs();
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].kind, "construct");
    assert.equal((await store.costs()).length, 0);
  } finally {
    await store.close();
  }
});

test("metadata-only claims enter source endings and unsupported metadata cannot bypass gates", () => {
  const story = fixture();
  const { candidate, checked } = checkFor(story);
  const result = checkConstructionCandidate(
    candidate,
    checked,
    story.sources,
    "r",
  ).story;
  result.claims.push({
    id: "metadata-only",
    text: story.sources[1].text,
    status: "supported fact",
    reviewed: false,
    evidence: [
      { sourceId: "S2", passage: story.sources[1].text, relation: "supports" },
    ],
  });
  result.editorial!.publishing.claimIds.push("metadata-only");
  assert(usedReportingSources(result).some((s) => s.id === "S2"));
  assert(gates(result).some((g) => g.code === "lineage"));
});

test("HTTP construction endpoint queues one private job, rejects stale versions and guards snapshot ownership", async () => {
  const store = new Store(undefined, ":memory:");
  await store.init();
  const story = fixture();
  await store.create(story);
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const submit = (version: number) =>
    fetch(`${base}/api/stories/${story.id}/construct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
  try {
    assert.equal((await submit(9)).status, 409);
    const first = await submit(1);
    assert.equal(first.status, 202);
    const job = await first.json();
    assert.equal(job.kind, "construct");
    assert.equal(job.privatePreview, true);
    assert.equal((await (await submit(1)).json()).id, job.id);
    assert.equal(
      (
        await fetch(
          `${base}/api/stories/${story.id}/construction/foreign/sources`,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(
          `${base}/api/stories/${story.id}/construction/${job.id}/sources`,
        )
      ).status,
      200,
    );
    assert.equal((await store.costs()).length, 0);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await store.close();
  }
});
