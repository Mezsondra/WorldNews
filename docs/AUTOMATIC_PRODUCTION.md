# Automatic private video production

New dossiers default to **Automatically prepare a script and private video after research**. The backend accepts `autoProduce: false` to opt out. Existing stories can use **Research → Automatic production → Make video automatically** (`POST /api/stories/:id/automate` with the current `version`).

The durable render worker now schedules preparation after research finishes, saves a script checkpoint, then queues rendering. No additional button is needed between research, script preparation and the private video. Source discovery still uses the configured API allowance; preparation and automatic media use no API credits. `npm start` runs both workers unless `WORKER_INLINE=false`.

## Script and evidence

Automatic narration is extractive: copy eligible research claim text verbatim and add the recorded publisher attribution. This avoids another model call and introduces no new factual wording. Disputed, insufficient, contradicted, untraceable, untranslated or insufficiently corroborated claims stay in the dossier and are excluded from narration. If fewer than 60 words are supported, stop rather than padding a script. Other omitted claims are reported in the preview warnings.

A supported subset may yield a private update while the broader research report still has gaps. The clip does not settle omitted allegations or legal disputes. If nothing passes the evidence checks, production stops with an explicit reason.

Updates of 60–139 narration words use the **brief** format with a measured 20–90 second video. Longer drafts retain the 140–205 word and 60–90 second bounds. This produces concise previews from the available material.

## Private preview and final production

Automatic previews use local `say` on macOS or `espeak-ng` on Linux, text scenes with source overlays, and estimated WebVTT timing. Per-job provider selection overrides configured paid narration/captions without changing process-wide settings. FFmpeg/ffprobe and the selected local voice must be installed. The manifest records the selected voice, format, private-preview status, warnings, source IDs, exact evidence and measured scene timings.

Private preview gates retain factual support, exact passages, source lineage, contradiction, translation and asset-rights checks. Human claim review, provisional source metadata and a missing event date can wait for the private preview. An unknown date is displayed as **Date pending**, never replaced with retrieval or publication time; malformed supplied dates still block production. All of these checks remain required for final production/approval.

Every automatic frame is labelled **PRIVATE PREVIEW · EDITORIAL REVIEW PENDING**. The UI shows warnings and the actual voice. Source metadata and claim review flags remain unchecked. An automatic preview cannot be approved, including if all remaining editorial checks are later cleared. Complete those checks and use **Create final render after review**, then inspect that exact version before approval. Existing publishing pause and account requirements remain in force.

Version checks prevent stale results from replacing an edited story. A unique active-job index prevents duplicate concurrent scheduling. Preparation and rendering persist separately; a saved script can continue into rendering after a restart. Failed/expired jobs stop into review. Explicit continuation of a failed attempt creates a new content version and retains the old job/history. No paid request is retried automatically.

This feature creates private review artifacts. It does not publish, approve evidence, monitor feeds continuously, authenticate footage, or resolve gaps that require further research.
