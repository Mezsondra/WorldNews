# Existing-account API pilot

This phase connects the user's existing Claude, Google AI Studio (Gemini), and AssemblyAI accounts. The approved initial combined allowance is **US$5 of API usage/credits**, excluding the already-paid server. Keys stay in ignored `.env`, never in the client or repository.

## Configure

```dotenv
ANTHROPIC_API_KEY=your_key
GEMINI_API_KEY=your_key
ASSEMBLYAI_API_KEY=your_key
PILOT_API_ENABLED=true
PILOT_BUDGET_USD=5
TTS_PROVIDER=gemini
GEMINI_VOICE=Kore
CAPTIONS_PROVIDER=assemblyai
```

Restart the backend after changing configuration. `TTS_PROVIDER=local` and `CAPTIONS_PROVIDER=estimated` retain the zero-service development path. Live calls are disabled in `.env.example` until deliberately configured. ElevenLabs is excluded from this capped pilot.

## What is connected

- **Claude Sonnet 4.6:** Research → Editorial assistant → Analyze sources or Draft narration. The assistant sees bounded snapshots from up to five attached sources (first 5,000 characters each, maximum 32 KB of source JSON). It cannot search the web, contact people, retrieve additional documents, or approve claims. Analysis records evidence gaps, perspectives to seek, and cautions. Draft results are structured, checked for exact source passages, source IDs, valid claim references, and 140–205 words. A held or invalid result does not overwrite the editor's script. Applying a valid draft creates a new revision, resets claim review, and invalidates approval. All reports remain available through the saved-report selector.
- **Gemini 3.8 Flash TTS:** The backend sends scene text verbatim through the Interactions API with a selected synthetic voice and neutral pacing metadata. Maximum eight scenes and 1,500 total narration characters by default; output token limits and audio size/time limits bound each call. No silent fallback or retry changes the voice after an error. The video manifest records the selected provider.
- **AssemblyAI Universal-2:** Uploads one generated narration track and submits one pre-recorded transcription job. Its provider transcript ID is saved before polling. WebVTT uses returned word timestamps. Recognized text is compared with the script; differences are visible and require an extra explicit caption review at approval. A timeout retains the provider ID and does not submit another job.

Private previews may be rendered before claim review so the editor can inspect the completed draft. Source passages, source lineage, attribution, unresolved contradictions, translations, dates, media rights, and length still gate production. Every claim must be checked before export approval. No publishing connector exists and no API result grants publication authority.

## Combined allowance

The database stores the limit, total reserved allowance, and one unique cost event per story/version/provider/operation. Reservations happen before paid calls:

| Operation                                       | Allowance reserved |
| ----------------------------------------------- | -----------------: |
| Claude source analysis                          |            US$0.50 |
| Claude draft                                    |            US$0.50 |
| Gemini narration for one bounded render         |            US$1.00 |
| AssemblyAI captions for one 60–90 second render |            US$0.10 |

These are conservative allowances, **not vendor prices or an invoice**. They are deliberately retained after success, failure, timeout, or invalid model output. The application refuses another allocation when it would exceed the persisted ceiling, and identical operations cannot spend again automatically. Concurrent requests use a conditional SQL allocation; restart does not reset the allowance. Changing the environment does not raise a budget already in use. This first pilot is cumulative, not a recurring monthly budget.

Provider usage counters and request/transcript IDs are retained where returned. Check account billing dashboards for actual charges and credit eligibility. This application limit covers its own bounded calls only; it does not control other applications using the same keys or replace provider-side billing controls. Model choice is pinned so an automatic fallback cannot silently select a more expensive model. Current integration references were checked on 31 October 2026; review rates/capabilities before extending the pilot.

## Reproduce a private smoke test

`npm run demo` seeds the historical NASA sources. `npm run pilot` explicitly creates a new historical dossier, analyzes its attached snapshots, generates a structured script, then renders Gemini narration and AssemblyAI captions if structural checks pass. All claims remain unreviewed and approval remains unset. This command spends allowance and is not part of `npm test` or application startup.

After inspecting a stopped attempt and correcting its cause, `npm run pilot -- --resume <pilot-story-id>` explicitly creates a new revision. It reuses existing analysis and a saved draft when validation permits; it does not silently repeat the same operation. The live historical pilot needed copyediting to preserve source attribution and distinguish 2024 forecasts from current news. This is evidence that model-generated drafts require editorial work, not an automatic editorial approval.

## Verified local run — 31 October 2026

- Claude account access, structured source analysis, and draft generation succeeded. An overlength draft was rejected. A later draft required original smart quotes to be restored and a single-lineage claim to remain attributed. The historical script was copyedited; none of its eight factual claims was marked reviewed.
- Gemini produced six narration scenes; FFmpeg assembled a **74.248-second 1080×1920 H.264/AAC video**, plus feed card and story image.
- AssemblyAI completed its transcription job and returned 167 recognized words against the 164-word saved narration. The mismatch warning remains visible and requires explicit caption review before approval.
- The pilot ledger retained **US$2.60 of conservative allowances** from the combined US$5 ceiling; US$2.40 remained available to reserve. These values are not billed charges. No social content was published and no export was approved.
- Automated provider/budget/security/workflow tests and the PostgreSQL integration check passed. A separate local-voice regression render exercised the measured timeline without API calls.

If a request fails, inspect Settings → API pilot and its saved provider record. Do not blindly run the pilot again; each new dossier can allocate more allowance. If a source or draft needs changes, edit deliberately and review the new version. Model output does not establish truth.

## Official references

- [Claude Messages API](https://platform.claude.com/docs/en/api/messages/create)
- [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Gemini speech generation](https://ai.google.dev/gemini-api/docs/speech-generation)
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [AssemblyAI pre-recorded transcription](https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/transcripts/submit)
- [AssemblyAI pricing](https://www.assemblyai.com/pricing/)
