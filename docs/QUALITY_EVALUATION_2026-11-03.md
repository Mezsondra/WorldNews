# Saved-story evaluation — 3 November 2026

This was a read-only structural evaluation of the six saved dossiers, followed by private rendering of eligible copies in an isolated database. It was not an independent factual audit, source-freshness verification, broadcaster-quality score or publication trial. The live dossiers were not edited, no paid provider call was sent and nothing was approved or published.

## Findings

| Saved dossier | Narration words | Result |
|---|---:|---|
| Europe protests, v6 | 153 | Private copy rendered: 71.959 seconds narration / 80 seconds final. Initial wrong-country media selection found, fixed and rerendered. |
| India protest, v8 | 62 | Held for supported context; below the 140-word minimum. |
| Poland tribunal, v16 | 62 | Held for supported context; below the 140-word minimum. |
| Crypto theft, v18 | 85 | Held for supported context; below the 140-word minimum. |
| Europa Clipper API pilot, v6 | 164 | Private copy rendered: 64.914 seconds narration / 72.917 seconds final. Uses document excerpts; needs more visual variety. |
| Europa Clipper historical demo, v2 | 149 | Private copy rendered: 60.600 seconds narration / 68.625 seconds final. Only 61.8% useful visual coverage; the remaining text/source fallback needs better evidence-linked treatment. |

All six lack a current separate check covering the complete headline, publishing description, on-screen assertions and narration. Passing the structural private-preview gates is not sufficient for unattended release. No dossier was promoted to factual approval by this evaluation.

The Europe-protest test exposed a real defect: generic protest/street keywords allowed Frankfurt imagery over France narration. The planner now rejects conflicting country/city metadata, including demonyms where supported. The fix applies to automatic discovery assignment, timed shots, cover-image selection and saved-render checks. The repaired private copy no longer selects those conflicting images. Source imagery marked archive/context now retains that label on video overlays. This remains a conservative filter, not image authentication.

## New template checks

Both renderers produced an explicitly fictional 167-word test story exercising same-unit comparison charts, source-stated process diagrams and attributed quotations. Each output has 70.372 seconds of narration plus eight seconds of closing sources, 78.375 seconds final, with ten shots. All five final evaluation/test videos decoded completely. Phone-size frames were inspected.

Charts require an explicit literal same-unit comparison; they reject conflicting direction, estimates, unsupported units, forecasts and unrelated financial amounts. Diagrams require the source's stated sequence repeated in narration. Quotations require matching quoted text and a source-named speaker. Overlong step/quote text falls back rather than silently hiding its ending. Every graphic retains exact evidence and is available through the visual timeline in both renderer engines.

The new rights form was saved and reloaded in an isolated browser workspace using a locally generated colour field. It recorded a documented decision in a new revision, retained the earlier private export and reset review state. No real media permission was asserted by that test.

## Reproduce and next release requirements

Run `npm run evaluate` against the local desk for a read-only report. Use `-- --input <saved-overview.json> --out <directory>` to repeat the same snapshot evaluation offline. It writes Markdown/JSON and never queues research, rendering or publication. Verification inputs, outputs, test logs, private source records and screenshots are ignored under `data/build3-next-verification/`; media is under the referenced `data/renders/` directories.

The current suite passed **145 tests**, with zero failures and two optional PostgreSQL checks skipped. TypeScript/production build and whitespace checks passed.

Next release work is substantive: expand the three short dossiers with supported context; obtain current complete-package checks; improve the NASA visual plans without inventing imagery/data; review media identity and documented reuse; add automatic caption/readability/audio/file checks and selective repairs; evaluate a varied ten-story set; then run the planned seven-day private operating trial. The current small set includes two versions of one historical NASA story and does not establish broad editorial quality.
