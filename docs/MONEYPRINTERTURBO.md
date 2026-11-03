# MoneyPrinterTurbo video renderer

The production studio offers **Standard · evidence visuals** (`classic` in the API) and **MoneyPrinterTurbo** video renderers. MoneyPrinterTurbo is optional and runs locally inside the existing durable render worker. Both engines now use the same [evidence-linked visual plan](VISUAL_PLANNING.md), caption treatment and closing references. The optional adapter receives saved narration and selected assets; it does not generate facts, search stock footage, call model providers or publish anything.

## Setup and use

Install Python 3.11 or newer, Git and FFmpeg, then run:

```sh
npm run media:setup
npm run build
npm start
```

The setup script creates an isolated virtual environment under ignored `.tools/moneyprinterturbo/`, installs the exact dependencies in `scripts/media/requirements.lock`, checks out the commit in `scripts/media/moneyprinterturbo.json`, copies its bundled font and verifies the rendering imports. If Python is outside PATH, use `MPT_SETUP_PYTHON=/absolute/path/to/python3.12 npm run media:setup`. The application reports setup availability in the renderer selector.

In **Preview → Video renderer**, choose **MoneyPrinterTurbo · footage & captions**, select **Local** or **Gemini · Kore** under **Narration voice**, then press **Build comparison preview**. This saves a new story revision and queues a private render. Gemini uses the configured `GEMINI_VOICE` (Kore by default) and requires the enabled API pilot, a configured key and $1 of available allowance. The previous renderer's export remains accessible through **Open previous Classic/MoneyPrinterTurbo video**. The selected renderer also applies to later automatic previews and final renders for that story. Classic continues to work without Python or the optional setup.

## Output and preserved evidence

The adapter uses the upstream renderer's video writer for 1080×1920 shots at 24 fps. The common planner aligns cuts with narration beats, normally using 3–6 seconds and allowing up to ten seconds for document/date explanations. It combines country locators, exact saved passages, dated context and eligible source media, with contained footage and restrained 2.5% photo motion. The opening headline appears for three seconds. A shared FFmpeg caption pass now gives both engines the same explicit portrait layout, at most two lines and separate source-credit space. The manifest retains the actual production profile. Source audio is muted and no background music is added by default. Earlier adapter helpers and historical verification below describe the preceding caption pipeline.

Narration segments keep their claim and evidence IDs. A separate frame-aligned shot plan covers the complete measured audio without a short final tail. Portraits are eligible only when the narration names their subject; archive images and source dates remain explicitly labeled. The manifest separately records narration segments and visual shots, including framing, video excerpt start, credits and reuse status. Captions may be estimated or explicitly aligned with AssemblyAI in a private preview or final production. The same cue timings feed both the downloaded VTT and the burned-in subtitles. The manifest records the renderer and exact upstream commit, together with all source credits and the scene-to-evidence mapping.

The narration cache keys each segment by text, pronunciation dictionary, provider, voice, model and speech style. A text change regenerates only the affected narration; visual changes reuse existing speech. Caption transcripts are cached by the complete audio hash and transcription configuration. Silent visual shots and thumbnails are cached by their actual material, framing, excerpt, overlays, duration and renderer version. Cached files carry SHA-256 checksums, so partial or corrupt files are not reused. Only changed shots are composed again; final assembly and caption encoding still run for the complete video.

In **Visual timeline**, selecting a thumbnail seeks the main player to that shot. Expand **Edit shot** to choose a source asset, report/source graphic, photo framing or video excerpt start, then **Save shot & rebuild**. Script edits clear outdated shot overrides. **Compare previous versions** provides a version selector and a separate player; earlier exports remain intact. Automatic background jobs continue to select local speech and estimated captions. Explicit paid preview settings are captured only for their authorized revision, including scheduler recovery.

Speech-aligned captions use the editor's script spelling mapped monotonically onto measured transcription spans, including split names and spoken numeric dates. Raw recognition, spelling adjustments and differences are retained in `transcript.json`; mismatches remain visible and require playback review. A script word with no measured speech span stops alignment instead of receiving a fabricated timestamp. Selecting Gemini and aligned captions requires up to $1.10 of available existing pilot allowance; reservations are created only for actual cache misses, and provider usage settles against the existing ledger. Failed requests are not retried automatically.

Changing renderers invalidates approval. Comparison previews remain private and cannot be approved as final exports; existing evidence, attribution and media-review checks continue to apply. Missing setup and rendering failures are reported explicitly rather than silently substituting a different renderer. Material edits and cancellation retain the existing version checks and worker leases.

## Docker

The default image includes Classic. To include the optional renderer in both app and worker images, set `MONEYPRINTERTURBO_ENABLED=1` before `docker compose up --build -d`. This adds Python, Git, the pinned checkout and isolated rendering dependencies at image-build time. Optional Docker installation is provided but has not been exercised on this local macOS run.

## Upstream attribution

MoneyPrinterTurbo by Harry is MIT licensed. Its full license is retained in `scripts/media/MoneyPrinterTurbo-LICENSE`; the dependency checkout also keeps its original LICENSE. The bundled BeVietnamPro font license is retained in `scripts/media/BeVietnamPro-OFL.txt` and copied into the isolated font directory. The adapter does not modify upstream source files. Source provenance and dependency pins are tracked in this repository; downloaded source, configuration, virtual environments and generated media are excluded from Git and Docker build contexts.

## Validation

A live local smoke test exercised video composition, narration, source-credit overlays and burned-in subtitles through the pinned upstream functions. The existing Binance and Poland dossiers completed as 50.48-second and 35.48-second private comparison previews. All scene WAV files match the earlier narration byte for byte; the recorded API reservation total stayed unchanged. Automated tests cover renderer selection, preservation of earlier exports, evidence gates, stale/concurrent jobs, narration-cache eligibility, subtitle boundaries and escaping of source credits. Build validation and complete-video decoding are also part of local QA.


## Short-shot validation — 2 November 2026

The revised Binance draft uses 85 narration words and ten shots across approximately 44.3 seconds. Poland uses 62 words and seven shots across approximately 32.3 seconds. Shots are independently frame-aligned within 3–6 seconds, including the final shot. Live Gemini narration and AssemblyAI transcription succeeded for both. A subsequent Poland revision reused all three narration segments, its transcript and six of seven visual shots, with no new cost events or allowance change. Automated checks cover cadence without gaps/tails, subject matching, timeline media gates, caption layout and script alignment, cache identity/integrity, explicit caption selection and revision-bound scheduler recovery. These remain private drafts with factual, media and pronunciation review pending.
