# Quality stage verification — 3 November 2026

## Implementation result

Implemented [automatic production checks and bounded repairs](VIDEO_QUALITY.md). A completed private file is retained for inspection when quality checks hold it; it is not promoted to automatic readiness or final approval. A current report is required before final approval. Human review flags and publishing controls remain separate.

The final suite passed **157 tests**, with zero failures and two optional PostgreSQL checks skipped because no disposable database was configured. TypeScript/production build and whitespace checks passed. Tests cover caption glyph widths, faithful regrouping using word spans, stale/held/missing quality receipts, exact-clause visual repair, the worker retaining a held preview without automatic retries, measured-duration repair under the same reservation, misleading English translation fields, related-story tails, combined validation feedback and outlet-name numerals.

## Actual file checks

An explicitly fictional local test video contains 70.372 seconds of narration and eight seconds of complete closing sources, 78.375 seconds total. It has 100% planned purposeful visual coverage across chart, process, quotation and document treatments. The final portrait file decoded completely; narration measured -16.31 LUFS and -1.77 dBTP. Caption regrouping reduced the worst reading rate from 22.28 to 19.86 characters/second while retaining every word and its speech span. Browser QA confirmed the report, hold notes, repair disclosure and existing approval guard.

The test fixture deliberately lacks a separate complete-package receipt and remains held for that reason. Passing mechanical checks is not factual approval. No fictional fixture was added to the live news desk.

A deliberately quiet ten-second narration extract measured -34.52 LUFS. One normalization repaired it to -16.01 LUFS and -2.2 dBTP, with duration still exactly ten seconds. A truncated video failed full decoding and received a file hold. These are actual FFmpeg measurements, not mocked provider results.

## Bounded run on the six earlier dossiers

The user-authorized run used the existing pilot ceiling of US$15. It consumed **US$0.936648**, leaving **US$8.685327**. No ceiling increase, subscription, approval or publishing action occurred. Each dossier received at most its existing two writer attempts. Previous versions and exports remain available. The newer elections dossier was byte-for-byte unchanged in the before/after overview snapshots.

| Dossier | Current revision | Result of this run |
|---|---:|---|
| India protest | 9 | Held. Final proposed draft had 128 words and an overlong summary. Earlier copy also tried to use related-story headlines as background. |
| Poland tribunal | 17 | Held. Final proposed draft had 196 words but its summary exceeded 220 characters. |
| Crypto theft | 19 | Held. Final proposed draft had 226 words, an overlong summary and too many publishing claim links. |
| Europe protests | 7 | Held. Proposed dates/counts were absent from their selected passages. |
| NASA API pilot | 7 | Held. The proposed headline's 1.8-billion quantity was absent from its linked passage. |
| NASA historical demo | 3 | Held. Proposed headline/summary quantities and a narrated quantity lacked the corresponding linked evidence. |

These are rejected proposals, not replacement narration. No dossier reached the separate semantic checking call in this run; all stopped during local validation. Consequently there are **no new validated real-news videos from this run**, and it is not a successful six-story editorial-quality trial. Three legacy dossiers still pass basic saved-evidence preview preflight, but none has a complete passing quality/package record. The small set also contains two versions of the same NASA event.

## Improvements made from those failures

Specific field errors now reach the next bounded writer attempt. A format error no longer hides evidence and word-count problems in otherwise readable fields: diagnostic parsing collects them together, while application still requires the strict schema. The writer receives explicit character limits and its previous narration. Excess words alone no longer waste the context-search pass.

Writer-provided English paraphrases cannot supply evidence via the translation field, including fabricated numeric or graphical support. The model evidence catalog excludes a clearly marked related-story tail without changing the saved source snapshot. Exact outlet names such as France 24 are excluded from quantity comparisons; a separate unsupported quantity of 24 still fails. These fixes have regression tests but were not used to send another paid attempt at exhausted dossiers.

## Next execution requirement

Resolve evidence linking and supported context sufficiently for one real package to pass the complete chain, then evaluate the varied ten-story set and seven-day private operation. Broader source extraction, independent factual/freshness review, media authentication, narrator/caption assessment, recurring budgets, admission and recovery remain open. No broadcaster-quality claim or unattended publishing readiness follows from these mechanical checks.

Ignored reproduction artifacts live in `data/build4-verification/`: before/after snapshots, six construction results, test logs, the private fixture render/report, failure/repair measurements, read-only evaluation and browser screenshot. The app remains available at port 4310.
