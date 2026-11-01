# Build plan execution — 31 October 2026

Update, 1 November 2026: [automatic related-photo discovery](AUTOMATIC_VISUALS.md) now runs between narration preparation and private rendering. The Poland preview includes two credited, archive-labelled Commons photographs. The media adapter currently retrieves raster photos; automatic event-video footage retrieval remains unimplemented. Sixty tests, including disposable PostgreSQL checks, and the production build passed. No additional AI allowance was reserved.

The original plan identifies **milestone B** as the immediate implementation target. This repository implements that local workflow and the supporting editorial controls. The full continuously running multi-platform product remains staged work.

Automatic private production now follows research with a persisted, source-linked extractive script and local narrated video. Existing stories can enable it explicitly. Brief updates avoid padding limited evidence. Private previews defer human metadata/date checks while retaining factual gates, and cannot be approved as final media. See [workflow and limits](AUTOMATIC_PRODUCTION.md).

Verification on 1 November 2026: 55 tests passed with disposable PostgreSQL checks enabled; TypeScript/Vite build passed. The Poland dossier generated a 35.469971-second 1080×1920 H.264/AAC private preview using local narration, three eligible findings and unchanged API allowance. Its remaining claims and source/date review requirements are visible. Nothing was approved or published.

The [story research bot](WEB_RESEARCH.md) now searches the web, retrieves public pages, assesses originating lineages, and runs a separate claim/evidence check for a selected topic. New dossiers can start it automatically; existing dossiers expose **Find sources & verify**. Findings remain unchecked and approval-gated. Continuous feed monitoring remains future work.

| Milestone                        | Status                              | Evidence / remaining work                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Requirements and access proof | Partial                             | Editorial rules implemented; three permitted public NASA pages retrieved; account access and source rights checklist documented below. Existing-account Claude, Gemini, and AssemblyAI calls passed a user-authorized US$5 local pilot. Monthly production budget and platform access remain open.                                  |
| B. One complete story            | Implemented locally                 | Manual topic/URL, original source snapshots, claim passages and translations, editable narration, replaceable rights-recorded media, 1080×1350 card, 1080×1920 story/video, WebVTT, manifest, source-page preview and approval-gated stable record. One historical demo rendered to a 60.7-second video and left awaiting approval. |
| C. Continuous discovery          | Not started; queue foundation ready | Durable SQL jobs, leases, crash handling, and version persistence exist. Feed polling, clustering, ranking, freshness, and update monitoring remain.                                                                                                                                                                                |
| D. Editorial dashboard           | Core implemented                    | Responsive Stories, Research, Preview, Publishing, Corrections, Settings, scene media selection, pronunciation dictionary, review, exact-version approval, holds, and global pause. Full affected-scene caching/regeneration and notifications remain.                                                                              |
| E. Instagram publishing          | Pending account access              | Export-only destination intent and version-specific approval exist. No OAuth, uploads, reconciliation, or live post.                                                                                                                                                                                                                |
| F. Other destinations and pilot  | Local API pilot started             | YouTube/X/TikTok explicitly show unconfigured states. Correction log and a combined pilot-allowance dashboard exist. Platform correction execution and long-term cost accounting remain.                                                                                                                                            |
| G. Selective autonomy            | Disabled                            | No autonomous publication path is implemented.                                                                                                                                                                                                                                                                                      |

## Access and capability checklist

| System            | Current state                                                           | Before enabling                                                                                          |
| ----------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| NASA source pages | Manual HTML retrieval works                                             | Curated feed registry, per-source terms, polling allowances, diverse regions and viewpoints              |
| Media             | Text cards by default; uploaded-image metadata required                 | Editor verifies license, creator, event context and restrictions; no automatic photo search              |
| Models/search     | Claude/Gemini/AssemblyAI pilot connected                                | Broader editorial evaluation, web discovery, monthly usage ceilings and billing reconciliation           |
| Speech            | Local voice and Gemini narration work; AssemblyAI word timings verified | Final licensed narrator choice, pronunciation evaluation and broader caption review                      |
| Instagram         | No account connected                                                    | Professional account, login route and permissions, current limits, reviewed live publication             |
| YouTube           | Export only                                                             | OAuth/project access, actual private-upload behavior, metadata and disclosures                           |
| X                 | Export only                                                             | Official API access, costs, limits and automation rules                                                  |
| TikTok            | Export only                                                             | Qualifying supported route, consent and eligibility review; no assumed unattended Direct Post            |
| Hosting           | Local; existing server inspected; Linux Compose supplied                | Server/domain, HTTPS, password/SSO, encrypted off-server backups, restore drill, render load measurement |

## Verification performed

- TypeScript and production Vite build.
- Domain, security, persistence, concurrency, job and HTTP workflow tests.
- PostgreSQL integration verification against an isolated disposable local database; conditional locks and persistence passed. The temporary database was removed after testing.
- Compose configuration validation with placeholder credentials (containers were not started).
- Original sample retrieval and actual local speech/FFmpeg render, probed as 1080×1920 H.264/AAC, approximately 60.7 seconds.
- In-app browser visual and workflow inspection; sample media inspected.

Docker Compose was not executed because the local Docker daemon is stopped. ElevenLabs and social APIs were not called. The ten varied editorial pilot stories and deliberate real-world failure cases in section 12 remain mandatory before live daily operation; synthetic tests do not replace that review.

## Next implementation order

1. Set a monthly operating ceiling, hosting choice, temporary/final brand, licensed narrator, and editor review routine.
2. Run an editor-reviewed pilot across varied stories and record source gaps and error rates.
3. Add a permitted diverse feed registry and source-update monitoring.
4. Integrate Instagram with versioned per-destination publication records and unknown-outcome reconciliation. Keep all first-release posts editor-approved.
5. Add other destinations after their account and policy requirements are demonstrated.

User-authorized API credits were used within a US$5 combined pilot allowance. No new subscription, server deployment, external message, or social publication was made. See [API pilot results](API_PILOT.md) for the 74.248-second API-backed preview, retained allowances, and editorial limitations.
