# Architecture

## Boundaries

- `src/`: responsive editorial dashboard. Server state is persisted; browser state only holds unsaved edits and UI selection. The browser never receives provider secrets.
- `shared/types.ts`: content, source, evidence, media, approval, and job contracts.
- `server/domain.ts`: conservative structural production gates and content invalidation.
- `server/fetcher.ts`: bounded public HTTP(S) retrieval, pinned DNS lookup, redirect validation, original text snapshots, SHA-256 hashes, and metadata extraction. Pages are inert data, never executable instructions.
- `server/db.ts`: durable stories, immutable content history, approved snapshots, jobs, settings, and audit events. PostgreSQL and SQLite use the same SQL contract. Internal revisions prevent concurrent non-content updates from overwriting each other; editorial versions identify material changes.
- `server/app.ts`: validated HTTP inputs, authentication, same-origin mutation checks, source operations, editing, editorial review, render enqueueing, approval, and corrections.
- `server/worker.ts`: one render at a time per worker process; conditional job acquisition; heartbeats; bounded processing time; stale-version cancellation. Deploy one worker initially.
- `server/media.ts`: deterministic 1080×1350 / 1080×1920 graphics, local or Gemini speech, measured scene durations, 12 fps H.264/AAC video, captions, and a source-linked manifest. Text cards carry the full scene narration. Captions use either estimated local timing or AssemblyAI word timestamps. Rendered clip durations determine scene boundaries.
- `server/providers.ts`: bounded Claude source analysis and structured drafting, Gemini Interactions TTS, AssemblyAI upload/submit/polling, and caption comparison. Evidence typography is restored to the original snapshot for smart quotes/nonbreaking spaces only; words, figures, and source identities must match. No model output checks or approves itself.
- `server/db.ts` also stores the cumulative pilot allowance, unique per-operation reservations, provider usage/IDs, and assistant reports. See [pilot controls](API_PILOT.md).
- `server/source-page.ts`: escaped, version-specific source records derived from approved content. Private previews use authenticated routes. Correction logs remain visible on old approved records.

## Approval invariants

Content version changes revoke current approval and reset all claim review checks. Private previews may precede the editor's checks; evidence, attribution, rights, dates, and length remain production gates. An old render cannot approve new content. Old pending/running jobs become cancelled; a media subprocess may finish its current scene, but cancelled jobs cannot replace current outputs. Approval requires a render of that exact content version, every factual claim checked, cleared structural checks, destination intent, editor identity, and preview attestation. Recognized caption differences require a separate explicit attestation. The server checks these prerequisites independently of UI button state.

Approved source snapshots are immutable content records, not social publications. A later edit does not silently rewrite a previously approved source record. Corrections are an appended log. Because no social publishers exist in this milestone, approval is for export only; it creates no public social post.

## Retry and recovery

Enqueueing the same story/version twice returns the active job. A partial unique SQL index independently enforces this constraint. Conditional acquisition prevents two processes taking the same job. Expired running leases fail into manual inspection; they do not silently restart paid speech. A queued job survives restart. Failed jobs can be explicitly retried. Partial render files are private, and never receive approval merely because they exist.

Application and worker roles share the same database and media volume. A render stores its exact story snapshot, claims, source metadata, source IDs per scene, asset IDs, duration, and voice. Production should move large media to object storage after access controls and retention rules are selected.

## Deliberate milestone choices

1. SQLite enables a local first story without starting a database service. PostgreSQL is supported through the same repository and is the Compose deployment default. Aggregate story documents simplify the first milestone; relational extraction of Claim, Source, and Publication records is deferred until discovery/publishing need cross-story queries. The pilot allowance and cost events already use relational records and conditional allocation.
2. FFmpeg plus SVG/Sharp implements the plan's media output without a browser renderer. Remotion can replace the frame compositor later. All media remains code-native; there is no invented event imagery or downloaded social footage.
3. Manual research and editing remain available. The next phase uses the user's existing Claude account to analyze attached snapshots and produce structured draft candidates. There is no automatic web search, invented outreach, semantic truth certification, or model-confidence gate. Exact passage checks and structural rules do not replace editorial judgment.
4. Local `say`/`espeak-ng` keeps a zero-service test path. Gemini and AssemblyAI provide the opted-in API path under a persisted user-approved pilot allowance. ElevenLabs remains excluded from this capped pilot. A final licensed voice, pronunciation evaluation, broader story pilot, monthly ceilings, and billing reconciliation remain before unattended paid production.
5. Platform publishing is visibly unavailable. Capability reviews, OAuth, token encryption, independent platform state machines, timeout reconciliation, current limit checks, and explicitly reviewed live tests remain before integration release.

## Security and release limits

Default binding is loopback. Remote hosting requires a long password and HTTPS in front of the app. Unknown Host headers and cross-site API mutations are rejected. Inputs are validated and content is escaped. Fetches reject credentials, nonstandard ports, local/private/reserved addresses, and unsafe redirects; DNS is pinned for each request. Files, article bodies, timeouts, image pixel count, child process runtime, and render concurrency are bounded. Uploaded images are decoded and rewritten to PNG; SVG uploads are not supported. Media filenames are generated IDs; source text never controls a shell command.

This first milestone does not include SSO, per-user roles, encrypted OAuth storage, automated retention enforcement, automatic source monitoring, integrated encrypted backups, metrics/alerting, or hosted high availability. A single successful render is evidence of basic pipeline function, not production capacity. Source extraction can omit dynamic text and metadata; the editor must inspect the original page and resolve gaps. A public URL is not a media license.
