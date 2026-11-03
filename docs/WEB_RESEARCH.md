# Story research bot

The **Research → Research bot → Find sources & verify** action runs a bounded background investigation. New dossiers have a checked **Start the research bot automatically** option when the pilot is enabled and at least US$1 is available. The API defaults `research` to true on story creation; send `research: false` for a manual dossier. Restarting the application does not retroactively research other stories.

## Workflow

1. Queue a persistent SQL run for the current content version and revision. A conditional database claim permits one worker; only one queued/running research run is allowed per story.
2. Reserve **US$1.00** from the existing combined pilot allowance before calling Claude. One reservation covers the bounded discovery and verification operation; it is not a vendor invoice.
3. Use Claude's `web_search_20250305` server tool for at most four searches: original documents, official accounts, independent reporting, relevant competing public accounts and original-language sources. Seed names and dates anchor the investigation to the actual event.
4. Only actual search-tool URLs become retrieval candidates. Ignore URLs invented in model prose. Up to ten retrieval attempts produce at most eight input sources, including attached seeds. Domain diversity helps selection but never establishes independence. Existing public-HTTP protections cover redirects, DNS, private addresses, sizes and deadlines. Inaccessible pages and PDFs remain leads only.
5. Persist readable snapshots as they are retrieved, even if verification fails. Exclude duplicate URLs and identical content hashes. Keep actual queries, failed/skipped leads and retrieval outcomes inspectable.
6. Run a separate structured evidence pass over up to 7,000 characters per source, with explicit truncation metadata and an 85 KB total bound. Assess provisional source type and originating lineage, record explicit original/derived/unknown relationships and attached parent sources, extract claims, preserve original-language passages and translation candidates, and record supporting/contradicting evidence and gaps. Reject invalid/cyclic origin graphs; common origins, parent links, identical hashes and matching publisher hosts conservatively share one origin group. Unknown origins do not establish independent support. Legacy records retain their recorded-lineage fallback.
7. Reject unknown source IDs and evidence that does not exactly match stored text. Contradicting passages force disputed status. Multiple websites repeating one lineage cannot independently support a claim. Empty/unresolved findings produce a hold for further evidence.
8. Append new unchecked claims and sources in a new version; invalidate approval and retain the research workflow. Preserve existing scripts, editorial metadata and claims. A concurrent edit, hold or revision change prevents stale findings being applied.

## Review and limits

Bot source type/lineage assessments are provisional. Inspect the original page and assessment, then save source metadata to confirm it before production can use the source. Review claims and translation candidates separately. Model output cannot certify truth or settle a legal/political dispute. Official statements establish what was said, not every underlying allegation.

The bot searches public statements; it does not contact or interview people, authenticate footage, bypass access restrictions, or publish. Search availability, index freshness, inaccessible pages and bounded excerpts can leave evidence gaps. Continuous feed discovery and update monitoring remain separate work. With automatic production enabled, the [private-video workflow](AUTOMATIC_PRODUCTION.md) follows research using either free extractive preparation or the separately disclosed US$2.50 [full-story construction](STORY_CONSTRUCTION.md) allowance. Preview narration remains local.

The dashboard polls persistent progress and shows actual queries, candidate outcomes and the verification report. Saved snapshots remain accessible after failure. Expired worker leases fail into review: no automatic paid retry or `pause_turn` continuation. Usable results already returned may still be checked. A story-version operation cannot allocate twice; failures retain their allowance. Budget exhaustion blocks additional paid work.

If discovery succeeded but verification failed, **Verify saved sources** explicitly queues a bounded verification-only recovery for that unchanged content version. Claude reserves US$0.50; the Google Interactions adapter reserves US$0.15. It reuses saved snapshots without searching. The checker selects fixed passage IDs; the backend supplies the exact stored text. Full content constraints are validated locally. Requests have a four-minute deadline. Timeout and validation reservations stay held. An inspected Google HTTP 400/500 rejection with no returned generation can be reconciled once, as documented by [Google billing](https://ai.google.dev/gemini-api/docs/billing#am-i-charged-for-failed-requests); this never re-enables the same operation key or refunds uncertain requests.

`npm start` includes the research worker. With `WORKER_INLINE=false`, use `npm run worker` to run research/render workers separately.

## API

- `POST /api/stories/:id/research` with `{ "version": 1 }` returns `202` and a persistent run.
- Add `"resumeRunId": "<failed-run-id>"` for verification-only recovery of saved sources from that unchanged content version.
- `GET /api/overview` includes `researchRuns` and the combined pilot ledger.
- `GET /api/stories/:id/ai-reports` includes `kind: "verification"` reports.
- `GET /api/stories/:id/research/:runId/sources` returns saved retrieved snapshots, including those from failed runs. Existing dashboard authentication protects these routes.

**Analyze sources** remains attached-snapshot analysis. **Draft narration** is another explicit operation.

Integration follows [Anthropic's web search tool documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), checked on 31 October 2026. The account must permit server-side web search.
