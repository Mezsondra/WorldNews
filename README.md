# World News — Editorial desk

A working local implementation of the immediate target in [the build plan](World_News_Bot_Build_Plan.md): one manually selected story through sources, evidence, narration, a breaking card, vertical video, and a matching source page. A responsive TypeScript dashboard operates the workflow. No social account is connected and nothing posts automatically.

The local API pilot supports Claude analysis and drafts, Gemini narration, AssemblyAI word-timed captions, and a persistent combined allowance. **Research → Research bot → Find sources & verify** now searches for sources and checks exact evidence passages in a background job. New dossiers can start it automatically within the configured budget. See [the research workflow](docs/WEB_RESEARCH.md) and [API pilot controls](docs/API_PILOT.md). Tests use mocked providers.

## Run locally

The optional [MoneyPrinterTurbo renderer](docs/MONEYPRINTERTURBO.md) adds full-frame footage, photo motion, timed on-screen captions and source credits. Run `npm run media:setup`, then choose it under **Preview → Video renderer** and build a comparison preview. Existing exports remain available.

Automatic previews now use [source photos, named portraits and video clips](docs/AUTOMATIC_VISUALS.md), with visible photographer/agency/publisher credits and original source records. Existing previews can find photos and videos and rebuild from the Preview screen. Publication dates stay separate from capture dates, manual scene selections are preserved, and source media remains pending review for final production.

Both renderers now add [evidence-linked locators, document highlights, timelines, comparison charts, process diagrams and attributed quotations](docs/VISUAL_PLANNING.md). The planner records each shot's narration, purpose and exact supporting passages, provides reading time and exposes coverage and supported choices in **Preview → Visual timeline**. The standard renderer includes these visuals without Python or extra model calls. Charts require explicit same-unit values, diagrams preserve the source's stated order, and maps never infer incident sites. Conflicting country/city metadata rules out media; it does not authenticate imagery. [Reuse decisions](docs/MEDIA_RIGHTS.md) separately record permission evidence, scope, credit, restrictions and expiry before final production.

New exports include [automatic quality reports and bounded repairs](docs/VIDEO_QUALITY.md) in **Preview**. Checks cover the full-package evidence receipt, visual coverage, caption layout/reading speed, audio levels/silence and complete decoding of the final video. Construction measures the local narration and can repair its length within the existing allowance. Local caption, visual-fallback and audio repairs preserve evidence and speech timing; unresolved results remain held and inspectable. Earlier exports need a current passing report before final approval.

New stories can run **research → checked story package → private video** automatically. Existing dossiers have **Research & build full story** in Research. The builder uses exact passages, bounded missing-context research, explicit source-origin relationships and separate checking of the headline, narration, planned callouts and publishing description. It reserves US$2.50 within the existing pilot allowance; a free extractive preparation path remains available. Automatic previews use local narration, preserve unresolved evidence warnings, and require editorial review plus a final render before approval. See [full-story construction](docs/STORY_CONSTRUCTION.md) and [automatic production](docs/AUTOMATIC_PRODUCTION.md).

Requires Node **24.13+**, npm, FFmpeg/ffprobe, and either macOS `say` or Linux `espeak-ng`. The installed local Node 25 and FFmpeg were used for verification.

```sh
npm ci
npm run build
npm run demo
npm start
```

Open **http://127.0.0.1:4310**. `npm run demo` fetches three real NASA source pages and creates one clearly labeled historical story. It does not mark evidence reviewed, generate paid audio, or approve exports. If a publisher changes the fixture wording, seeding stops for review rather than fabricating an excerpt. Seeding is idempotent.

Local SQLite and generated media live under ignored `data/`. Credentials are unnecessary for the local voice and database. Optional configuration is described in [.env.example](.env.example). For frontend development, run `npm run dev` and `npm run ui` in separate terminals; Vite uses port 5173. For production-like local preview, use `npm run build` and `npm start`.

## Find stories from feeds

**Stories → Leads from feeds** polls the RSS/Atom feeds you register (a suggested starter list is one click away) every 15 minutes, respecting each site's robots.txt. Headlines from the last 72 hours are grouped, ranked by how many feeds carry them, and flagged as possible updates when they match an open story. Several feeds can repeat one original report, so a lead is never treated as corroboration. **Open dossier** pre-fills the new-story form; research spending still needs your choice. Set `DISCOVERY_POLL_MINUTES` (minimum 5) to change the interval.

## Use the workflow

1. **Stories:** open a dossier with a topic or a public HTML source URL. Topic entry starts manual research; it does not pretend to run an automatic search.
2. **Research:** inspect original source text, publication/retrieval dates, author, language, and shared source lineage. Correct source metadata and identify original documents as primary where justified.
3. Add factual claims and narration. Attach **exact passages from retrieved snapshots**. Preserve reviewed translations alongside non-English passages. Save the revision, then check each claim against its narration and evidence.
4. **Preview:** generate the card, story image, narrated video, WebVTT captions, and scene manifest. Render jobs persist across application restarts. Inspect pronunciation, citations, factual wording, and mobile readability. Local speech is a development voice; captions use estimated word-group timing within measured scene audio.
5. Optionally upload a photo with creator, permission, original URL, date, location, archive status, and contextual restrictions. Select it on a scene in Research. The renderer labels archive imagery and credits its creator. These are editor declarations, not automated rights or image-context verification.
6. **Publishing:** choose intended destinations, enter the reviewing editor's name, and attest that the rendered revision was inspected. Approval records that exact revision and opens `/s/<short-story-id>?v=<version>`. Approval **does not send a post**. All platform connectors are visibly unconfigured.
7. Edits revoke approval, cancel old queued jobs, reset evidence checks, and require fresh media. **Corrections** adds a permanent log and a new revision. Previously approved source records preserve their content with the latest correction log.

The supplied local demo was rendered during development and left **awaiting review**, with a 60.7-second H.264/AAC video. It is historical material from October 2024, not current news. Generated files are intentionally untracked.

With the configured APIs, Research → Editorial assistant can analyze attached sources and create a new script revision. Generated claims remain unchecked. Private previews can precede claim review, but all structural evidence/media checks still apply and every factual claim must be reviewed before export approval. Caption differences detected after transcription require a separate explicit check.

## Editorial checks

- Every narration segment needs linked claims and inspectable supporting passages.
- Single-source statements require primary-source attribution; eligible secondary reporting retains explicit publisher attribution. Established facts require at least two independent recorded origins. Shared reporting keys, derivation links, identical snapshots and matching publisher hosts conservatively count together; unknown origins do not establish independence. Legacy records retain their lineage fallback.
- Constructed packages require a current separate evidence-check receipt for the headline, summary, narration, planned on-screen assertions and publishing text. Material content/evidence changes invalidate it. Separate passes on the same model remain provisional and do not certify truth.
- Insufficient evidence, allegations, analysis, unresolved contradictions, missing translations, invalid dates, missing media provenance, and missing media rights block production.
- All exports require human approval. Structural checks cannot decide truth, identify a mistranslation, infer source independence, detect an unrelated photo, or verify that attribution is sufficient. The editor must assess those questions, including sensitive claims and names, figures, dates, and quotations.
- Scripts must contain 140–205 words; measured narration must last 60–90 seconds, excluding closing references. Both renderers append every used reporting source on readable, paginated eight-second cards. Total video length is bounded to 120 seconds. Short findings stop for more supported context; the old brief format cannot bypass the minimum. Earlier exports remain accessible but require a new compliant render before approval.
- Changes to retrieved source text create a new revision and invalidate approval. Source rechecks are manual in this milestone.

## Architecture and deployment

React/Vite frontend; Express TypeScript backend; SQL repository using PostgreSQL when `DATABASE_URL` is supplied, and SQLite for zero-service local development. A durable SQL job queue uses conditional acquisition, expiring leases, a uniqueness constraint, cancellation, and optimistic story revision checks. One worker processes renders at a time. FFmpeg assembles Sharp-rendered text/verified-image scenes with real synthetic speech. [Architecture](docs/ARCHITECTURE.md) records tradeoffs and limitations.

`compose.yaml` supplies PostgreSQL, separate application and worker containers, durable volumes, health checks, and worker resource limits. Set `POSTGRES_PASSWORD`, a **24+ character** `DASHBOARD_PASSWORD`, and `PUBLIC_BASE_URL` in `.env`, then run:

```sh
docker compose up --build -d
docker compose exec app npm run demo
```

The dashboard listens on loopback by default. Non-loopback Node hosting requires the configured password. HTTP Basic authentication accepts any username with the configured password; place an HTTPS reverse proxy or authenticated private tunnel in front of a server. Configure `ALLOWED_HOSTS` for its hostname. Public source-page routes expose approved snapshots only; all media and private routes share dashboard authentication when configured. No cloud service or domain was provisioned. See [operations](docs/OPERATIONS.md) for backup and recovery procedures and remaining production work.

## Verification

The current suite has **147 tests**: 145 passed and two optional PostgreSQL checks were skipped in the latest local run. TypeScript/Vite build validation passed. The [3 November trial](docs/QUALITY_EVALUATION_2026-11-03.md) evaluated all six saved dossiers and rendered three eligible copies privately; the three short dossiers were held. It exposed and corrected a France/Germany image mismatch and identified incomplete package checks and weak NASA visual coverage. Both engines also rendered the new templates in a labelled fictional 78.375-second test video. All five final videos decoded completely; phone-size/browser checks passed. No paid provider call, live dossier edit or publication was made. Independent factual evaluation, a varied story set and the unattended operating trial remain pending.

```sh
npm test
npm run build
```

The workflow tests exercise editorial gates, source lineage, stale passages, translation requirements, unlicensed assets, escaping, private-network rejection, robots.txt rules for automated research, optimistic concurrency, SQLite persistence, job uniqueness, expired worker leases, HTTP approval, correction records, and cancellation on material edits. Provider tests cover bounded requests, source-passage validation, cumulative allowance persistence, concurrent allocations, duplicate/failed requests, word timing, and caption drift. An optional PostgreSQL integration test runs only with `TEST_DATABASE_URL` pointing to a **disposable empty database**. Browser QA used the Codex in-app browser, and a live three-provider smoke test produced a 74.248-second historical preview. Full ten-story editorial evaluation, broader provider evaluation, container execution, and platform upload pilots remain release gates.

See [implementation status](docs/IMPLEMENTATION_STATUS.md) for completed work, plan deviations, and the remaining milestones.
