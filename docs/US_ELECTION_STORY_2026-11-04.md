# US election explainer completed — 4 November 2026

The existing US-election dossier is complete as a private, versioned explainer awaiting editorial review. It uses the November 3 France 24 reporting snapshot, rather than claiming current race results. The early-ballot figure remains explicitly attributed secondary reporting; independent confirmation of that national count is not claimed.

## Finished export

- Story: `c11f59c6-b4e0-4b2c-a772-3698a80d797f`, revision 9.
- Title: **U.S. midterms: early ballots and the race for Congress**.
- 163 narration words; **75.8 seconds of measured speech**; **91.833 seconds total**.
- Six original source-linked graphics and two document treatments across nine shots. The early-count graphic spans two shots. Planned purposeful visual coverage is 100%.
- Gemini Kore narration, AssemblyAI word timing, 28 caption cues and a maximum reading rate of 19.83 characters per second. Final audio measured **-16.5 LUFS / -3.41 dBTP**; the complete H.264/AAC portrait file decoded successfully.
- All five reporting documents appear on two separate eight-second closing cards. All automatic quality checks passed, with no remaining findings. Human claim/provenance approval remains unchecked and publication remains paused.

The video is `data/renders/c11f59c6-b4e0-4b2c-a772-3698a80d797f/v9/video.mp4`. Its captions, manifest, measured quality report and closing-card artwork are alongside it. The dashboard's Preview opens the latest revision; the private source record is `/api/stories/c11f59c6-b4e0-4b2c-a772-3698a80d797f/source-page`.

## Reporting sources

1. [France 24 — US midterm elections: Over 58 million Americans cast early ballots](https://www.france24.com/en/video/20261103-us-midterm-elections-over-58-million-americans-cast-early-ballots), November 3, 2026. The figure is supported by the reporting headline and is carried with explicit attribution.
2. [USAGov — Congressional elections and midterm elections](https://www.usa.gov/midterm-elections), updated October 6, 2026.
3. [USAGov — Early in-person voting](https://www.usa.gov/early-voting), updated October 20, 2026.
4. [U.S. Election Assistance Commission — Why do election results change after election night?](https://www.eac.gov/why-do-election-results-change-after-election-night), December 23, 2025.
5. [U.S. Election Assistance Commission — Election Results, Canvass, and Certification](https://www.eac.gov/election-officials/election-results-canvass-and-certification), July 30, 2026.

The official sources support explanatory procedures, rather than a 2026 race outcome. Same-agency documents share an originating lineage. Unrelated 2022 coverage and other unused reporting were excluded from the active evidence packet; previous dossier versions remain in history. Source snapshots and exact claim passages are retained.

## Production and verification

An editor-authored script was checked in a separate Claude call using the existing full-package schema and evidence gates. The first check supported the assertions but local validation caught missing attribution in metadata references. Those links/callout wording were corrected and the exact package checked again. No human approval flags were set.

Actual rendering exposed three implementation defects: multiword spoken numbers were treated as caption changes, a same-named Antarctic settlement caused “France 24” to conflict with United States graphics, and the 128 kb/s AAC encoder overshot the peak ceiling. Literal speech-form comparison now preserves changed-word/number holds, complete multiword timing spans are retained, country aliases cannot locate an unrelated same-named settlement, and 192 kb/s AAC delivery with measured headroom passes the unchanged final peak limit. Original graphics retain their full portrait canvas, clause association and explicit identity in the video, source record and interface.

Final frames and both closing cards were inspected at phone size. Lower graphic labels were moved clear of the caption area. Later visual/audio rebuilds reused all four saved narration segments and the existing transcript, making no further paid request. The final suite passed **164 tests**, with zero failures and two optional PostgreSQL checks skipped; build and whitespace checks passed.

Total additional API cost was **US$0.206654**, leaving **US$8.478673** in the existing allowance. No ceiling increase, public approval or publishing action occurred. The other six dossiers and publication settings were unchanged. Audit records, rejected checks, intermediate private exports and the reviewed output remain available. Reproduction/inspection artifacts are under ignored `data/election-completion/`.
