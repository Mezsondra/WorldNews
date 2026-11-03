# Evidence-linked visual planning

The automatic renderer now plans explanatory visuals from the saved narration and its linked evidence. Both the standard FFmpeg renderer (`classic` in the API) and optional MoneyPrinterTurbo use the same plan, caption layout and closing sources. Standard rendering needs no Python or optional renderer installation. No additional model call, subscription or allowance is required for these templates.

## Templates

**Document highlights** typeset an exact contiguous excerpt from a supporting passage, with publisher, report title and publication date. They are labelled saved text, not represented as screenshots of the publisher's page. Longer text is visibly abbreviated; the full passage remains in the source record. Saved translations are explicitly labelled. Unsupported, contradicting or untraceable passages are excluded.

**Country locators** use an offline Natural Earth coastline reference and country/territory label points. A place must be named in both the current narration clause and its linked supporting evidence. A story's region, publisher location or retrieval metadata cannot supply an event location. Ambiguous standalone names are conservatively excluded. Maps draw no political borders, infer no city or incident coordinates, and visibly identify label points as context. Each locator and source record credits the data; the upstream commit, original file paths, hashes and public-domain terms are recorded in [the data reference](../server/references/README.md).

**Dated context** compares two or three distinct explicit dates already present in the narration beat and supporting source sentences. It preserves source wording about plans and uncertainty. Publication/retrieval dates cannot become event dates. The initial parser handles ISO dates, full English month/day/year dates, and years; relative dates and date ranges do not establish separate events. Date order does not imply causality. Abbreviated months and more complex date expressions remain future work.

**Comparison charts** use explicit same-unit temporal comparisons repeated literally in narration, such as a source stating that site counts increased from one value/year to another. Original counts and year labels are retained with a zero baseline. The conservative grammar currently supports selected count units; it does not compare unrelated money amounts, percentages, denominators or metrics, calculate a trend, or turn estimates/forecasts into observed counts. Conflicting direction, reversed/future periods and uncertain quantities fall back to another treatment.

**Process diagrams** require an explicit First/Next-or-Then/Finally sequence in supporting text, repeated in narration. The steps preserve source wording and order. Ordinary sentence order or chronology cannot imply a mechanism or causal chain. Overlong steps fall back rather than clipping their endings.

**Attributed quotations** require exact quoted text and a speaker named by the source's own attribution, both present in narration. A byline or publisher is never guessed as the speaker. Translations are labelled and the graphic states that it is reported text rather than recorded speech. The quote must fit the layout in full; otherwise it falls back to another treatment.

## Planning and timing

The planner records a narration segment, a clause, a purpose and exact claim/source passages for every generated graphic. Content-derived IDs keep choices tied to the current evidence. It chooses available map/timeline/document treatments rather than alternating generic narration paragraphs with publisher lists. Photo/video selection also checks the current narration clause, requires named portrait subjects, and conservatively requires textual relevance unless an editor explicitly selected the scene media. This remains a heuristic, not image authentication or semantic media verification.

Cuts align with narration-segment boundaries, with frame rounding bounded to the next 24-fps frame. Shots normally last 3–6 seconds; document and dated explanations can last up to ten seconds for reading. Each narration beat must last at least three seconds; shorter beats stop with a request to combine supported segments. The clause at the shot midpoint determines its primary visual. Within-beat clause timing currently follows measured segment audio and proportional script positions; it is not a word-accurate visual edit decision. Continuous narration, captions and the complete closing references are preserved.

Only supported templates are eligible. A story without explicit places or distinct dates may legitimately use document excerpts. If no usable template or relevant media exists, the renderer retains a transparent text/source fallback and records the coverage deficit. It does not invent geography, dates or data to achieve variety.

## Inspection, reuse and provenance

**Preview → Visual timeline** displays each shot, type, duration, purpose and evidence publishers. The editor can choose a current evidence-linked template or eligible media and rebuild. The API accepts a `visualId` alongside `kind: "map" | "document" | "timeline"` in the existing renderer route's `shotOverrides`. It resolves this ID from the current server-derived plan, never from arbitrary client-supplied map/date/excerpt payloads. Invalid/stale references are rejected. Dated-context overrides require at least six seconds of reading time.

The render and manifest retain the full `visualPlan`, each selected visual, exact evidence, shot timings, coverage and a `productionProfile` containing the actual renderer/version, narrator/voice, caption provider and versioned caption layout. Common caption placement keeps two readable lines clear of graphics and credits. Narration, transcription and visual caches preserve unchanged work across visual-only revisions. Existing exports remain available.

The source page exposes each rendered explanatory visual's timing, narration, purpose and full supporting passages, plus map-data provenance where used. Rendering and approval reject a selected graphic whose saved payload no longer matches the current evidence-derived plan. This supplements the existing editorial-package fingerprint and review requirements; it does not certify source accuracy or replace editorial review.

## Coverage and remaining work

Coverage counts narration time occupied by planned explanatory graphics or selected media; closing credits are excluded. It reports full-text fallback duration, warns below the initial 90% target and flags reliance on one visual treatment. This measures planned treatment, not whether an image actually depicts the correct event, a graphic is persuasive or a viewer can read every word. Coverage remains informational until the broader Build 4 quality gates are evaluated.

The six templates and [structured media-rights decisions](MEDIA_RIGHTS.md) are implemented. Conflicting country/city metadata is rejected during discovery assignment, shot/cover selection and saved-render validation. The offline reference uses pinned Natural Earth data and a conservative place/demonym vocabulary; unknown or matching geography remains unverified. Precise visual alignment to speech, image authentication, automatic readability/audio/file checks and a varied real-story evaluation remain required before unattended release. No publishing account or automatic approval was enabled. See the [first six-dossier snapshot trial](QUALITY_EVALUATION_2026-11-03.md) for concrete remaining gaps.

## Local verification — 2 November 2026

- 131 tests passed, zero failed; two optional PostgreSQL checks skipped. TypeScript/production build and whitespace checks passed.
- New checks cover exact evidence, inference limits, date validity/ranges, translations, contiguous timing, reading time, forged/stale visual IDs, escaped/rasterized templates, source-page provenance, coverage, caption styling and HTTP override persistence without spending.
- Both renderers produced a labelled **fictional test fixture**, not a factual news story: 69.994729 seconds of narration plus eight seconds of complete closing references, 78 seconds final, ten shots using all three templates. Both complete videos decoded without errors; frames were inspected at 360×640. A caption/map overlap found in the first pass was corrected and the videos rebuilt.
- Rebuilding reused all four narration segments and all ten visual shots for both engines. No paid provider call or publication was made, and the live story database was not modified. Inputs, manifests, private videos, source records and screenshots are under ignored `data/build3-verification/` and `data/renders/visual-build3-fixture-*/`.
- Browser QA used an isolated SQLite workspace to inspect coverage, seeking and evidence-linked choices. These checks establish implementation and rendering behavior, not BBC/CNN/DW-level editorial quality; real-story evaluation remains pending.
