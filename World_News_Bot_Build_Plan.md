# World News Bot — Build Plan

Version 0.1 · 31 October 2026 · Working specification

This plan records the agreed direction and proposed implementation. Proposed defaults are adjustable. No service has been purchased, account connected, server provisioned or content published by preparing this plan.

## 1. Product and first release

Build a continuously running English world-news system, operated through a private dashboard on a computer or phone. Instagram is the primary destination. YouTube, X and TikTok receive suitable versions through supported publishing routes.

The system discovers developments, traces their sources, gathers relevant perspectives, records evidence, writes narration, prepares visual media, and queues publication. The first release requires editorial approval before any public post. Selective automatic publishing is a later, separately configurable capability.

| Decision | Status |
|---|---|
| English narration and captions | Agreed |
| World-news coverage | Agreed |
| Instagram first; other social destinations follow | Agreed |
| Breaking-news images as well as videos | Agreed |
| Server operation with a dashboard | Agreed |
| Narrator first; presenter optional later | Proposed default |
| One 60–90 second video daily; breaking cards when justified | Proposed starting cadence, not a quota |
| General-interest politics, international affairs, climate, science and major economic developments | Proposed initial coverage |
| Channel name, brand, voice, hosting and budget | Open |

Start with a curated, diverse source list. World-news coverage does not mean comprehensive access to every event or language. Coverage gaps must remain visible to the editor.

## 2. Content outputs

| Output | Proposed treatment | First release |
|---|---|---|
| Breaking card | Brief attributed headline, time, source label, optional verified photo; 1080 × 1350 feed design | Yes |
| Vertical video | 1080 × 1920, 60–90 seconds, narrator, captions and synchronized sources | Yes |
| Story source page | Stable public URL with evidence links, update time and corrections | Yes |
| Story image | 1080 × 1920 adaptation of a breaking card | Generate initially; publishing capability checked separately |
| Carousel | Several slides explaining evidence and viewpoints | Later |
| Long explainer | Approximately 3–5 minutes with deeper context | Later |
| Presenter version | Optional host segments over the same approved script | Later |

These dimensions and lengths are design proposals. Validate every destination's current media requirements before integrating it. Keep clean master assets and generate platform-specific layouts; do not copy downloaded posts or carry another platform's watermark.

## 3. Daily use

The dashboard opens to a story queue showing the development, its importance, its evidence gaps and its status. The editor can add a URL or topic manually, request more research, dismiss a story, or start production.

For a completed draft, the editor sees the narration alongside supporting passages and a playable video. Controls allow text edits, photo replacement, pronunciation changes and regeneration of affected scenes. Material edits invalidate previous approval and regenerate dependent audio, captions and source overlays.

Before publication, the editor selects destinations and reviews their previews and captions. The dashboard then shows each platform's independent publication status and resulting post link. Failed destinations can be retried without reposting successful ones.

Main screens: Stories, Research, Preview, Publishing and Settings. Include a corrections view, operational alerts and a global pause-publication control. Notifications are configurable; no messaging service is selected yet.

## 4. Discovery and story selection

Use permitted RSS feeds, APIs, official websites, public records and manually entered links. Begin with a candidate registry of international and regional reporting outlets, governments, legislatures, courts, international organizations, statistical agencies, scientific institutions and civil society sources. Validate access and usage conditions for each connector before enabling it. A public page is not automatically licensed media.

Group coverage by event and update existing story records. Separate event time, publication time, update time and retrieval time. Compare new information with previous posts to avoid presenting recycled material as breaking news.

Rank stories by public importance, evidence availability, recency, novelty and relevance. Review geographic and source diversity across the shortlist. Popularity and social trends may suggest research leads but must not establish truth or automatically trigger posts.

Initial feed checks can be configured around every five minutes where source terms and rate limits allow. This is a polling proposal, not a guaranteed detection speed. Use backoff, conditional requests and bounded research budgets.

## 5. Research and evidence

Research in the original language where practical, then produce English output. Preserve original passages alongside reviewed translations. The research workflow should look for:

1. The earliest traceable reporting and the underlying document, recording, statement or dataset.
2. Official accounts and the evidence supporting them.
3. Relevant opposition, critics or competing parties and their actual responses.
4. Qualified experts whose expertise matches the question, including affiliations and conflicts.
5. Affected communities and independent evidence that help test the accounts.
6. Contradictions, missing information and developments since the initial report.

Do not force every perspective into every story. Search for relevant public commentary; automated outreach and interviews are outside the first release. Never imply somebody was contacted if the bot only searched their public statements. “No public response found as of [time]” must be bounded by the search performed.

Store each factual claim with its supporting passage, source URL, author or speaker, relevant dates, retrieval time, source lineage, language, translation and verification status. Retain copies or excerpts where permitted. Track supporting and contradicting evidence separately.

Multiple websites repeating one report count as a shared source lineage. A government statement establishes what the government said; its underlying allegation may remain disputed. “Earliest source found” must not become “confirmed origin.”

Evidence statuses: supported fact, attributed statement, allegation, analysis, disputed, or insufficient evidence. Avoid relying on a model's self-reported confidence percentage as a publication gate.

## 6. Editorial gates and breaking news

| Condition | Required treatment |
|---|---|
| Reliable original announcement | Attribute the announcement accurately; do not assume all claims in it are established |
| Central claim supported by independent evidence | Eligible for editorial review; assess source quality and contradictions |
| Only one secondary source | Seek the original or independent corroboration; otherwise hold |
| Contradictory accounts | Explain the disagreement and uncertainty; require review |
| Anonymous social post, inaccessible source or uncertain translation | Use as a lead only; hold unsupported assertions |
| Casualty figures, identities, criminal allegations, elections, conflict or market-moving claims | Mandatory editor review, including in later automatic modes |
| No appropriate photo | Use a text card or accurate map |
| Source changes before publication | Recheck affected claims and invalidate approval where material |

Breaking news uses a short verified claim and conservative attribution. It does not wait for a complete explainer, but it still passes evidence and media checks. Track the detection-to-draft time; do not promise publication within a fixed number of minutes regardless of verification.

The script checker compares names, numbers, dates, quotations, translations and conclusions against evidence. A separate model pass can flag mistakes but cannot certify truth. Missing evidence triggers research, editing or a hold.

After publication, continue watching important sources. Surface changes and prepare corrections for every affected destination. Preserve a correction log rather than silently rewriting the public source page. Evaluate whether to update a caption, publish a correction, replace a video or withdraw a post case by case; platform capabilities differ.

## 7. Narration, visuals and citations

Start with a licensed synthetic narrator selected through short English pronunciation tests. Maintain a dictionary for names, places, abbreviations and numbers. Produce speech timing information for subtitles and visual cues. Clearly distinguish the narrator from quoted speakers; do not imitate officials or experts.

Use a repeatable visual system with substantive variation: verified footage, document excerpts, maps, data graphics, quotation cards and restrained transitions. Images must have known provenance and documented usage permission. Preserve photographer attribution, event date, location, archive status and any restrictions. If these cannot be established, block the asset.

Do not synthesize realistic depictions of the reported event for use as evidence. Future presenter segments must be clearly identified as virtual and meet the applicable platform disclosure rules.

Every factual script segment references claim IDs. Each claim references source IDs. A scene manifest combines narration segment, source IDs, asset IDs and timing. Generate the video overlays, captions and public source page from this manifest so citations do not drift apart.

Show readable publisher/date/source references and an appropriate shortened URL on the main Instagram version. Provide full source links on the story page and in platform text where useful. Keep references inside tested UI-safe areas. Render platform-specific versions where link or overlay requirements differ; TikTok's integration guidelines need separate review before approving its template.

## 8. Technical architecture and deployment

Proposed starting approach: one TypeScript application codebase for the dashboard, backend and workers, with clear modules for research, evidence, production and publishing. This reduces operational complexity. Introduce Python only for a demonstrated extraction or analysis need.

| Component | Responsibility |
|---|---|
| Web dashboard and backend | Authentication, editing, approvals, settings and public source pages |
| Research worker | Feed ingestion, retrieval, extraction, source tracing and evidence collection |
| PostgreSQL | Stories, claims, source records, versions, approvals, jobs and publication records |
| Persistent job queue | Schedules, bounded retries, cancellation, locking and recovery |
| Language-model adapter | Structured research, scripts and checking; provider selected through evaluation |
| Narration adapter | Text-to-speech and timing; ElevenLabs is an initial candidate |
| Render worker | Remotion templates and FFmpeg media handling |
| Asset storage | Originals, approved media, voice tracks, renders and source excerpts where permitted |
| Publishing adapters | Platform-specific validation, authorization, upload, status checks and reconciliation |

Develop locally using a deployment configuration that also supports a Linux server. Start with one server running separate application and worker processes/containers. Limit render concurrency so research and the dashboard remain responsive. Size the server after measuring representative renders. Hosted model and voice services are the proposed baseline; that avoids needing local model inference hardware initially.

Use separate development and production settings, durable database volumes, encrypted off-server backups and a tested restoration procedure. Move rendering to another machine when measured load justifies it. Container restarts alone do not guarantee continuous availability; monitor worker heartbeats, queue delays, disk space, credentials and ingestion freshness.

Treat retrieved pages as untrusted content: they cannot change instructions, invoke tools or grant publication authority. Restrict fetchers against private network access, bound file sizes and timeouts, and isolate media processing. Keep API secrets and OAuth tokens on the backend, encrypt sensitive credentials, avoid logging them, and provide revocation controls. Use HTTPS and strong dashboard authentication.

## 9. Workflow and data model

Story stages: discovered, triaged, researching, evidence-ready, drafting, checking, producing, awaiting-review and approved. A story can also be held, rejected or superseded. Publications have separate per-platform stages: queued, uploading, processing, published, failed or unknown-outcome.

Version scripts, source snapshots, media and approvals. Approval identifies the exact content version and destinations. A critical content change invalidates approval and cancels queued publication for the old version.

Core records: Story, Development, Source, EvidenceExcerpt, Claim, ClaimSourceLink, ScriptVersion, Asset, Scene, Render, Approval, Publication, Correction, Job and CostEvent.

Use a unique publication key for story/version/platform, persistent locking and provider identifiers. After a timeout, check the platform for the previous upload before retrying. Do not assume a timed-out request failed or claim exactly-once publication where the external API cannot guarantee it. Unknown outcomes enter reconciliation or manual review.

The pause control prevents new publishing actions and cancels queued posts where supported. It cannot recall a request already accepted by a platform or automatically remove content already public.

## 10. Publishing integration sequence

| Destination | Implementation plan | Gate before release |
|---|---|---|
| Instagram | First live connector; confirm professional account, login route, permissions and image/Reels support | Complete account setup and one explicitly reviewed live publication |
| YouTube | Add uploads, metadata and applicable synthetic-content declaration; explicitly select private for testing | Verify actual project permissions, visibility behavior and processing outcomes |
| X | Official API posting of adapted images/video and text with source links | Confirm account/API access, costs and automation requirements |
| TikTok | Assess a supported publishing service or creator-completed upload workflow | Verify that the intended use and consent flow qualify; no assumption of unattended Direct Post |

TikTok's current Direct Post guidelines exclude an internal utility used only for accounts a team manages, restrict unaudited clients, and require user control and consent. An approved third-party service is a candidate route, not an automatic exemption from these requirements.

YouTube's published documentation has contained inconsistent statements about unverified-project visibility. Test actual behavior for the chosen project and resolve requirements before promising public automated uploads.

Each adapter checks current media and metadata limits, disclosure requirements, permissions and posting status. Do not automate platform websites to bypass unavailable APIs or reviews. Keep exports available if a publishing integration is delayed.

## 11. Build milestones and acceptance

| Milestone | Deliverable | Acceptance criterion |
|---|---|---|
| A. Requirements and access proof | Source registry, editorial rules, account capability checklist and provider shortlist | Known access gaps documented; a sample source can be retrieved; no paid commitment required |
| B. One complete story | Manual URL/topic input through evidence, script, card, vertical video and source page | Editor can inspect support for every factual narration segment and replace an asset |
| C. Continuous discovery | Feed polling, clustering, ranking, update tracking and job recovery | Repeated coverage joins an existing event; restart resumes work without losing approvals |
| D. Editorial dashboard | Responsive research view, editing, scene regeneration, approval and pause controls | Material edits invalidate approval and update dependent outputs |
| E. Instagram publishing | Account authorization, destination preview, publishing and status reconciliation | An approved post succeeds; a simulated timeout does not cause blind duplicate posting |
| F. Other destinations and pilot | YouTube/X connectors, TikTok route decision, correction workflow and cost dashboard | Per-platform failures remain isolated; pilot outputs pass editorial and technical checks |
| G. Selective autonomy | Explicit allowlists, exclusions, spending limits and audit history | Enabled only after pilot review and user configuration; high-risk coverage remains reviewed |

Milestones overlap where practical, but account access and source rights can delay integrations independently of coding. Confirm an engineering schedule after milestone A. A polished multi-platform newsroom is a staged product, not a single prompt or one automation chain.

## 12. Evaluation, costs and operating controls

Before live daily operation, evaluate at least ten varied stories plus deliberate failure cases: recycled news, conflicting figures, several outlets sharing one source, missing expert response, a mistranslated quote, an unrelated photograph, a corrected announcement, a dead source, a worker crash and an uncertain upload outcome.

Release criteria: every factual sentence links to inspectable evidence; unsupported core claims are held; quotations and figures match sources; assets have recorded permissions and correct context; the rendered mobile preview has readable captions and citations; material changes invalidate approval; and restart/retry/pause behavior works as described. These are acceptance checks, not a guarantee that errors are impossible.

Measure source independence, editorial correction rate, review effort, source coverage, render duration, publication success and actual cost per story. Record voice minutes, model/search usage, storage, bandwidth, rendering and publishing charges. Separate those from fixed hosting and any footage licensing.

Choose a monthly operating ceiling before paid production. Split it across infrastructure, research/model usage, narration/rendering, publishing access and media. Add per-story limits, bounded retries and a reserve for breaking coverage. When a cap is reached, pause expensive jobs and notify the editor; never weaken evidence requirements to fit a budget. No supplier prices are quoted in this plan.

## 13. Decisions needed, in order

1. Monthly operating budget, excluding development. This determines model usage, media licensing, rendering and publishing choices.
2. Existing infrastructure, if any: a suitable server and domain, or a new isolated deployment. Do not place rendering on a business-critical server without measuring headroom.
3. Channel identity and narrator: use a neutral temporary brand during development, then approve the name, design and voice before launch.
4. Instagram account availability and preferred account ownership. Confirm other platform accounts during their integration milestones.
5. Pilot review routine: when the editor will check the queue and which notification method to use.

The immediate implementation target is milestone B: one manually selected story producing a traceable research dossier, a breaking card and a narrated vertical video with matching citations. Account registration and continuous monitoring can proceed alongside it after the initial access checks.

## 14. Official implementation references

Accessed 31 October 2026. Recheck requirements during integration. These links establish vendor capabilities and constraints; editorial rules, architecture and milestones above are proposed design decisions.

- [Meta: Instagram content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/) — canonical reference; direct retrieval was rate-limited during this planning pass. Confirm the chosen login route and account capabilities in implementation.
- [Meta-maintained Instagram API collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) — complementary integration reference.
- [YouTube: videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert) — uploads and writable metadata.
- [YouTube: synthetic-content disclosure](https://support.google.com/youtube/answer/14328491?hl=en) — disclosure requirements.
- [YouTube: channel monetization policies](https://support.google.com/youtube/answer/1311392?hl=en) — original-value and repetitive-content considerations.
- [X: automation rules](https://help.x.com/en/rules-and-policies/x-automation) — automated-posting requirements and API use.
- [TikTok: content sharing guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/) — eligibility, consent and audit constraints.
- [Remotion: rendering](https://www.remotion.dev/docs/render) — programmatic rendering options.
- [ElevenLabs: speech with timing](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps/) — audio/text alignment.
- [FFmpeg documentation](https://ffmpeg.org/ffmpeg.html) — media processing and conversion.
- [Docker: Compose in production](https://docs.docker.com/compose/how-tos/production/) — single-server deployment.
