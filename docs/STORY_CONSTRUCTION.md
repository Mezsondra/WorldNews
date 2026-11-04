# Evidence-backed full-story construction

Build 2 adds **Research → Automatic production → Research & build full story**. It constructs a coherent, evidence-linked package and continues into a private video without another render click. It does not certify factual accuracy or approve publication.

New dossiers offer **After research, build and separately check a full story**. This is preselected only when the existing Claude pilot is enabled and at least US$3.50 remains for initial research plus construction. The construction option requires US$2.50 available. Existing API callers retain the extractive default; send `buildFullStory: true` to choose the new method. No budget setting is increased.

## Bounded workflow

1. Admit one durable construction job for the current story version. Wait for active research/production to finish, reject stale versions and prevent duplicate paid operations.
2. Reserve **US$2.50 from the existing pilot allowance** before any construction provider request. This is a local allowance reservation, not a guaranteed vendor invoice or maximum vendor charge. Actual returned usage is estimated using the existing pricing table. Unknown usage and uncertain failures retain their reservation; no automatic transport retry is sent.
3. Supply up to eight saved sources, at most 7,000 characters per source, with explicit truncation information and an 85,000-byte total input bound. Source passages have server-assigned IDs; prose and search snippets cannot invent evidence.
4. Ask the writer for 140–205 useful narration words, targeting 160–185, across development, mechanism, context, significance, response and uncertainty as supported. Also construct a headline, summary, publishing description and on-screen callouts, each linked to claims and exact passages. Unsupported expansion, repeated sentences and duplicated segments cannot satisfy the length requirement.
5. If missing context prevents a responsible story, permit **one context pass**: at most two actual web searches, four public-page retrieval attempts and three new snapshots. Retrieve only URLs from actual search-tool results. Preserve blocked/unreadable leads as leads, never evidence. Existing network and robots protections remain in force.
6. Run a separate structured checker over every assertion and every supplied source. The writer and checker use separate calls to the **same model**; this is not independent editorial verification. The checker assesses entailment, attribution, numbers, dates, units, names, quotations, uncertainty and source origins. Local checks require exact passage references, complete assertion coverage, quote/quantity consistency and the existing evidence/translation/contradiction gates.
7. Permit at most **two writer attempts and two checking passes**, with at most five provider calls in total including context search. Unresolved work stops with reasons and evidence gaps. It does not loop indefinitely or replace the script with an unchecked result.
8. Save a passing package as a new unchecked revision, attach related visuals through the existing discovery path, then queue the private renderer automatically. Human source, claim, translation and visual review remain pending. Measured audio must still satisfy 60–90 seconds of narration, excluding closing sources; a word-count pass alone does not guarantee runtime. Automatic audio-driven rewriting belongs to Build 4.

## Source origins and complete citations

Each new assessment records `original`, `derived` or `unknown`, a shared origin key, parent-source references where available, and an explanation. Unknown/self references and cycles are rejected. Shared keys, explicit derivation links, identical snapshot hashes and matching publisher hosts conservatively merge sources into one origin group. Unknown origins do not count as independent support. Legacy records without this structure retain their recorded-lineage fallback.

The source registry exposes these fields for editorial inspection and correction. Model assessments remain provisional. Two websites or two publishers alone do not establish independent reporting. A primary statement establishes what its author said, not the truth of an underlying allegation.

Closing source cards include reporting documents used by metadata assertions as well as narration. The source page shows the complete editorial package, exact supporting passages, checker status and source relationships. Existing readable pagination and measured-duration requirements apply to both renderers.

## Saved work and changes

Construction reports preserve progress, returned drafts, checking results, actual queries, retrieval outcomes and gaps. New snapshots are stored as they arrive and remain inspectable even if later work fails. A hold can attach those snapshots in a new unchecked revision while preserving the existing script.

Version/revision/cancellation checks prevent concurrent edits from being overwritten. A content fingerprint ties the checking receipt to all assertions, claims, event date and evidence/source metadata. Material changes block rendering and approval until checked again. Visual selections, review flags and pronunciations do not themselves require another package-checking call. Existing exports stay available; rebuilding a rendered version creates a new content version.

The free **Prepare from existing findings · no API cost** path remains available for eligible legacy dossiers. It copies supported findings with attribution and holds when they cannot meet the current duration standard. It cannot silently replace a constructed editorial package.

## API and worker

- `POST /api/stories/:id/construct` with `{ "version": 1 }` returns `202` and a durable `construct` job.
- `GET /api/stories/:id/ai-reports` includes `kind: "construction"` reports.
- `GET /api/stories/:id/construction/:jobId/sources` returns snapshots for that story's construction job. Existing dashboard authentication applies.
- `POST /api/stories` accepts `buildFullStory: true`; the scheduler proceeds from research into construction and rendering.
- `npm start` runs the worker locally; existing separate-worker deployment also handles construction jobs.

## Verification and remaining evaluation

The local suite on 2 November 2026 passed 120 tests, with two optional PostgreSQL checks skipped. TypeScript/production build passed. New mocked-provider tests cover construction, exact evidence, all assertion surfaces, source-origin graphs, bounded repair/retrieval, stale edits, durable continuation, ownership, duplicate admissions, allowance exhaustion and uncertain paid failures. Browser QA confirmed the builder, new-dossier choice and source-origin controls without submitting paid work or modifying live stories.

No live construction provider call or editorial story-set evaluation was performed for this build. Model adherence, real-world evidence quality, actual cost and final visual quality still need evaluated private runs. Build 3 supplies useful beat-specific visual templates; Build 4 supplies broader quality checks and unattended-operation evaluation. No publishing account or recurring spending was enabled.
