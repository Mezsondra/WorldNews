# Operations

## Local and container roles

`npm start` serves the built frontend/API and runs one inline render worker by default. `WORKER_INLINE=false` disables the inline worker; start `npm run worker` as a separate process using the same database and `DATA_DIR`. Compose uses this separate layout. Keep **one worker** until queue-wide render capacity and server headroom are measured. Expensive child processes have timeouts and two encoder threads.

Use `PUBLIC_BASE_URL` before rendering real exports. It is baked into source overlays and manifests. Changing it requires a new content revision/render so the editor reviews the final URLs. Do not expose the local default HTTP endpoint on the public Internet. Use HTTPS, a long `DASHBOARD_PASSWORD`, and `ALLOWED_HOSTS` at a minimum. A reverse proxy must preserve a permitted Host; Basic authentication is for a small single-editor deployment, not a multi-user newsroom.

No external API secrets are required for the local-voice pipeline. Claude/Gemini/AssemblyAI integrations are opt-in and reserve against a persistent combined pilot allowance before paid calls; see [API pilot](API_PILOT.md). The approved initial allowance is US$5 of credits/usage excluding the user's existing server. Settings shows reservations and provider records. Finished calls are settled once: their cost is estimated from recorded tokens at the list prices in `server/pricing.ts` and the unused reservation is released (an overrun is added). Failed/uncertain calls and calls without complete usage records retain allowances; restarts do not reset totals. Update `server/pricing.ts` when a model or provider price changes. This pilot cap is **not a monthly budget or provider invoice**. Monthly/per-story accounting, reconciliation against provider invoices, and long-term ceilings remain before continuous paid operation. No job retries a provider call automatically after a worker crash.

## Backup and restoration procedure

Local SQLite: stop both roles, then copy the complete `data/` directory to a dated backup. Keep database and media together. Never copy only `news.sqlite` while WAL writes are running. For hot backup, use the SQLite online backup API rather than a raw copy.

PostgreSQL: pause work/stop application and worker writes, run `pg_dump --format=custom` against the configured database, and archive the corresponding media volume. Secrets must be supplied through the process environment or an approved secret manager, not command arguments or logs. Encrypt both artifacts to the selected backup recipient, transfer off-server, record hashes and retention, then resume work. Select and configure a backup provider before production; no off-server destination is assumed here.

Restore into **new isolated volumes/database**, using `pg_restore` for PostgreSQL or the whole stopped local SQLite directory. Keep `HOST=127.0.0.1`, paid narration disabled, publication paused, and no production platform credentials. Start the app, inspect stories and approved source records, verify representative media hashes, inspect job states, and generate a local-voice test render. Compare approval versions and audit history before switching any production traffic. Record the drill's date, duration, and result. This procedure is supplied but a full media-plus-database disaster recovery drill has not been completed.

## Failures

- **Render failed:** read the dashboard job error. Existing approved exports are preserved. Inspect partial media/provider usage before a manual retry. Source changes or script edits need fresh claim review and a new revision.
- **Expired lease:** after a crash, the worker marks the job failed. This avoids repeating a paid request whose result is uncertain. Queued jobs are durable and can be acquired after restart.
- **Source changed:** recheck creates a new revision and resets evidence. Old passages that no longer match the new snapshot block production.
- **Publication paused:** future publishing actions must be prevented by each eventual publishing adapter. This milestone has no live publisher. Pausing cannot recall accepted platform requests.
- **Source page unavailable:** drafts are private; only approved versions have an unauthenticated source route. A local URL remains local until a server and domain are configured.

Before unattended operation, add worker/database health metrics, queue delay, source freshness, storage/disk alerts, credential expiry checks, structured redacted logs, cost accounting, encrypted backup automation, and a recorded restoration drill. Container restart policies alone do not establish continuous availability.
