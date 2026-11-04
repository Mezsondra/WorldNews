# World News implementation checklist

Started 2 November 2026. Scope and acceptance criteria: [automation and quality plan](AUTOMATION_QUALITY_PLAN.md).

## Build 1 — duration and complete source records (completed)

- [x] Share one production standard across drafting, automation, both renderers, approval, and the dashboard.
- [x] Require 140–205 narration words and at least 60 seconds of measured speech, excluding source credits. Hold insufficient stories without padding.
- [x] Append readable, paginated closing sources after narration in both renderers.
- [x] Derive closing citations from all used reporting sources; retain separate reports from the same publisher and exclude unused research leads.
- [x] Include timeline-only visual assets in source-page credits.
- [x] Record narration/story/credit timings, source IDs, asset IDs, and the exact source-page URL in the render contract.
- [x] Keep old exports available; require a new compliant render before approval under this standard.
- [x] Verify boundaries, citation completeness, approval rejection, build, and an isolated local render without paid calls.

## Build 2 — evidence-backed story construction (implemented; live evaluation pending)

- [x] Add missing-context research and bounded script repair.
- [x] Check the headline, narration, on-screen assertions, and publishing text against evidence.
- [x] Trace source independence explicitly and retain uncertainty.

## Build 3 — useful visuals

- [x] Plan evidence-linked visuals for narration beats, preserving segment boundaries and recording each shot's primary clause. Word-accurate within-beat alignment remains future work.
- [x] Add initial maps, document highlights and dated-context timelines to both renderers and the automatic workflow.
- [x] Add charts, process diagrams and dedicated attributed-quote layouts, conservatively derived from explicit saved evidence.
- [x] Add structured rights decisions, byte/context binding, permission scope and expiry checks; preserve private documentation separately from public credits.
- [x] Strengthen asset/context matching with conflicting country/city rejection across discovery, shots, covers and saved-render checks. Image authentication and broader semantic evaluation remain open.
- [x] Persist the actual production voice/caption/renderer profile for each new render.

## Build 4 — quality and unattended operation

- [x] Add versioned saved-evidence, visual, caption, audio and final-file checks with bounded selective repairs. [Scope and limitations](VIDEO_QUALITY.md); independent factual/media evaluation remains open.
- [ ] Add automatic lead admission, recurring budgets, durable stages, and failure reconciliation.
- [ ] Run an evaluated story set and seven-day private operating trial.

## Build 5 — publication and corrections

- [ ] Validate Instagram access, then YouTube, against official requirements and the actual accounts.
- [ ] Deploy public versioned source records and independent publishing state machines.
- [ ] Complete a reviewed publishing pilot, source monitoring, correction handling, backup/restore trial, and limited automatic release.

Paid subscriptions, increased spending limits, account connections, and public publishing are not enabled by this checklist. Local implementation and private verification continue using existing access.

## Build 1 verification — 2 November 2026

- 102 tests passed, zero failed; two PostgreSQL integration checks skipped because no disposable test database was configured. TypeScript and production build passed.
- Added regression checks for legacy brief rejection, saved short-draft rejection, story-wide citations, same-publisher documents, pagination, credit overflow, incomplete release records, and timeline-only asset credits.
- Both renderers produced isolated historical NASA previews using local narration, with no paid API calls or publication. Classic: 60.600459 seconds of narration / 68.653938 seconds final. MoneyPrinterTurbo: 60.600458 seconds of narration / 68.63 seconds final. Both include all three reporting documents on a separate eight-second closing card.
- Full-video decoding passed for both outputs. Closing-card frames were inspected at phone size. The dashboard displayed narration duration/source count correctly, and Watch source ending sought to the completed references.
- Verification inputs/results and sample artifacts live in ignored `data/build1-verification/`; the live story database was not modified by this verification.

Build 1 establishes duration and citation requirements. Build 2 supplies the bounded research/writing loop described below. Build 3 now adds the first evidence-linked visual templates. These builds do not certify factual accuracy or connect publishing accounts. All publication and editorial-review safeguards remain in place.

## Build 2 verification — 2 November 2026

- Implemented [full-story construction](STORY_CONSTRUCTION.md), using one US$2.50 reservation within the existing pilot allowance. At most two writer attempts, two separate checking passes and one context search pass; unresolved or uncertain work stops into review.
- Checks cover headline, summary, narration, planned on-screen assertions and publishing description. Exact passage validation, quantity/quotation checks, current content fingerprints and explicit source-origin relationships supplement the separate model pass. All human review flags stay unchecked.
- Metadata-only reporting sources now appear in closing credits. The source record exposes checked assertions, evidence passages and origin relationships.
- 120 tests passed, zero failed; two optional PostgreSQL checks skipped. TypeScript/production build and whitespace checks passed. Tests use mocked providers; no paid construction run or live quality evaluation was performed.
- Browser QA confirmed the builder, new-story checkbox and source-origin form. The app was restarted to load the new backend and left running; no live story was edited. Screenshot: ignored `data/build2-verification/dashboard-construction.png`.

## Build 3 initial templates — 2 November 2026

- Implemented [visual planning](VISUAL_PLANNING.md), using exact supporting excerpts, offline country locators and explicit dated context. No new model call or allowance is required. Both renderer engines share the plan and caption treatment; the standard renderer works without Python.
- The visual timeline exposes purpose, evidence and eligible graphic choices. Render manifests/source records retain the selected payload, provenance, timing and production profile. Invalid/stale graphic references block rendering/approval.
- 131 tests passed, zero failed; two optional PostgreSQL checks skipped. TypeScript/production build and whitespace checks passed. Browser inspection used an isolated SQLite workspace.
- Both engines rendered an explicitly fictional test story to 78 seconds: 69.994729 seconds of narration and eight seconds of closing sources, with ten shots using the three initial templates. Full decoding passed; phone-size frames were inspected and a caption overlap corrected. A subsequent rebuild reused all four narration segments and ten visual shots on both engines.
- No paid provider calls, publishing actions or live dossier edits were performed. Verification artifacts are ignored under `data/build3-verification/`.

The later Build 3 extensions are recorded below. Real provider/story-set evaluation and unattended-operation trials remain release requirements, as do human approval and an inspected final render before publication.

## Build 3 extensions and first saved-story trial — 3 November 2026

- Added explicit same-unit comparison charts, source-stated process diagrams and source-attributed quotations to automatic planning and both renderers. Added [documented reuse decisions](MEDIA_RIGHTS.md), including permission basis/scope, readable credit, changes, restrictions, expiry and binding to actual media bytes/context.
- The context confirmation button no longer substitutes a generic reuse permission for the original license. Pending media may appear in labelled private previews; final production requires a current documented decision. Blocked/expired media is rejected. Private proof notes and URLs stay out of public source pages and export manifests.
- [Evaluated the six saved dossiers](QUALITY_EVALUATION_2026-11-03.md). Three are too short; three produced private copies. All six lack a current complete-package check. A France/Germany media mismatch was found and corrected. One NASA draft has only 61.8% useful visual coverage, exposing remaining quality work.
- Both engines rendered the three new templates in an explicitly fictional 78.375-second test video, with 70.372 seconds narration and eight seconds closing sources. All five final trial/test videos decoded completely. Browser QA exercised and reloaded a rights decision on a generated test asset in the isolated workspace.
- 145 tests passed, zero failed; two optional PostgreSQL checks skipped. Production build and whitespace checks passed. No paid calls, public publishing or live dossier edits were performed.

Build 4 remains open: broader factual/media/readability/audio checks, bounded repairs, recurring budgets, failure reconciliation and the evaluated operating trial. This first snapshot trial does not certify the stories or broadcaster-level quality.

## Build 4 first quality stage — 3 November 2026

- Added [automatic checks and bounded repairs](VIDEO_QUALITY.md); [verification and six-dossier outcomes](QUALITY_STAGE_EVALUATION_2026-11-03.md) distinguish measurable production checks from factual approval.
- 157 tests passed, zero failed; two optional PostgreSQL checks skipped. Build and whitespace checks passed. A real fictional 78.375-second export passed mechanical checks and remained held for its missing package receipt. Quiet-audio repair preserved duration; a damaged file was rejected.
- Re-ran the six earlier dossiers within the existing allowance: US$0.936648 used, US$8.685327 remaining. All six stopped on evidence/format requirements before separate semantic checking; no new validated real-news video was produced. Earlier exports remain and the newer elections dossier was unchanged.
- Improved combined repair feedback, English translation handling and navigation exclusion based on the failures. No extra paid attempt was sent after exhausting each dossier's two drafts. The varied editorial evaluation, recurring operation/recovery work and private operating trial remain open.
