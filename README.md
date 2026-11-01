# World News — Editorial desk

A working local implementation of the immediate target in [the build plan](World_News_Bot_Build_Plan.md): one manually selected story through sources, evidence, narration, a breaking card, vertical video, and a matching source page. A responsive TypeScript dashboard operates the workflow. No social account is connected and nothing posts automatically.

The local API pilot supports Claude analysis and drafts, Gemini narration, AssemblyAI word-timed captions, and a persistent combined allowance. **Research → Research bot → Find sources & verify** now searches for sources and checks exact evidence passages in a background job. New dossiers can start it automatically within the configured budget. See [the research workflow](docs/WEB_RESEARCH.md) and [API pilot controls](docs/API_PILOT.md). Tests use mocked providers.

## Run locally

New stories can run **research → source-linked narration → private video** automatically. Existing dossiers have **Make video automatically** in Research. Automatic previews use local narration, preserve unresolved evidence warnings, and require editorial review plus a final render before approval. See [automatic production](docs/AUTOMATIC_PRODUCTION.md).

Requires Node **24.13+**, npm, FFmpeg/ffprobe, and either macOS `say` or Linux `espeak-ng`. The installed local Node 25 and FFmpeg were used for verification.

```sh
npm ci
npm run build
npm run demo
npm start
```

Open **http://127.0.0.1:4310**. `npm run demo` fetches three real NASA source pages and creates one clearly labeled historical story. It does not mark evidence reviewed, generate paid audio, or approve exports. If a publisher changes the fixture wording, seeding stops for review rather than fabricating an excerpt. Seeding is idempotent.

Local SQLite and generated media live under ignored `data/`. Credentials are unnecessary for the local voice and database. Optional configuration is described in [.env.example](.env.example). For frontend development, run `npm run dev` and `npm run ui` in separate terminals; Vite uses port 5173. For production-like local preview, use `npm run build` and `npm start`.

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
- Single-source statements require primary-source attribution. Established facts require at least two distinct recorded source lineages.
- Insufficient evidence, allegations, analysis, unresolved contradictions, missing translations, invalid dates, missing media provenance, and missing media rights block production.
- All exports require human approval. Structural checks cannot decide truth, identify a mistranslation, infer source independence, detect an unrelated photo, or verify that attribution is sufficient. The editor must assess those questions, including sensitive claims and names, figures, dates, and quotations.
- Scripts must contain 140–205 words; measured narration must last 60–90 seconds. Long scripts fail rather than silently speeding up narration or dropping text.
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

The current research/automatic-production update passed **55 tests**, including the disposable PostgreSQL checks, plus TypeScript/Vite build validation. The Poland dossier produced a **35.469971-second** 1080×1920 H.264/AAC private preview from three eligible findings, with no additional API reservation. FFmpeg decoded the output without errors and browser QA confirmed the video loads.

```sh
npm test
npm run build
```

The workflow tests exercise editorial gates, source lineage, stale passages, translation requirements, unlicensed assets, escaping, private-network rejection, optimistic concurrency, SQLite persistence, job uniqueness, expired worker leases, HTTP approval, correction records, and cancellation on material edits. Provider tests cover bounded requests, source-passage validation, cumulative allowance persistence, concurrent allocations, duplicate/failed requests, word timing, and caption drift. An optional PostgreSQL integration test runs only with `TEST_DATABASE_URL` pointing to a **disposable empty database**. All 34 checks passed with that integration enabled. Browser QA used the Codex in-app browser, and a live three-provider smoke test produced a 74.248-second historical preview. Full ten-story editorial evaluation, broader provider evaluation, container execution, and platform upload pilots remain release gates.

See [implementation status](docs/IMPLEMENTATION_STATUS.md) for completed work, plan deviations, and the remaining milestones.
