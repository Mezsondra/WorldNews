# Automatic private video production

The pipeline now includes [related-photo discovery](AUTOMATIC_VISUALS.md), assigning reusable archive images before rendering. Discovered photo identity and license review can wait for a private preview; it remains mandatory for final production.

New dossiers offer **Automatically prepare a script and private video after research**, plus **After research, build and separately check a full story** when the Claude pilot has sufficient allowance. The full-story option selects [evidence-backed construction](STORY_CONSTRUCTION.md); it is preselected only when US$3.50 remains for initial research and construction. The backend accepts `autoProduce: false` and `buildFullStory: false` to opt out of both paths.

Existing stories can use **Research → Automatic production → Research & build full story** (`POST /api/stories/:id/construct` with the current `version`). This reserves US$2.50 from the existing allowance for bounded writing, missing-context research and separate checking. The free extractive path is labelled **Prepare from existing findings · no API cost** (`POST /api/stories/:id/automate`). No spending limit is increased.

The durable worker schedules the selected preparation method after research finishes, saves a script checkpoint, then queues rendering. No additional button is needed between research, script preparation and the private video. Initial source research and full-story construction use their disclosed allowances; local preview narration and existing automatic media discovery add no API credits. `npm start` runs both workers unless `WORKER_INLINE=false`.

## Script and evidence

The full-story builder constructs narration, headline, summary, publishing description and planned on-screen callouts from exact saved passages. It permits at most two writer attempts, two separate checking calls and one missing-context search pass (two searches, four retrieval attempts, three new snapshots). The checker assesses every assertion and source origin. Unknown origin, unresolved meaning or invalid evidence can hold the package; a current content fingerprint is required before rendering. Writer and checker are separate passes on the same model, and all findings remain provisional. See [construction bounds and failure handling](STORY_CONSTRUCTION.md).

The free preparation path is extractive: copy eligible research claim text verbatim and add the recorded publisher attribution. This avoids another model call and introduces no new factual wording. Disputed, insufficient, contradicted, untraceable, untranslated or insufficiently corroborated claims stay in the dossier and are excluded from narration. If fewer than 140 useful words are supported, stop rather than padding a script. Other omitted claims are reported in the preview warnings.

A supported subset may yield a private update while the broader research report still has gaps. The clip does not settle omitted allegations or legal disputes. If nothing passes the evidence checks, production stops with an explicit reason.

All new drafts require **140–205 narration words and 60–90 seconds of measured narration**. Shorter findings stop with a request for supported context; they are not padded. The legacy `brief` field remains readable in older records but cannot bypass the new minimum, including through saved-draft recovery.

Both renderers append complete closing references after the narration: three source records per eight-second page, retaining separate documents from the same publisher. Credits do not count toward the minute-long story minimum. Total video length is bounded to 120 seconds. A versioned production record stores narration duration, story duration, closing-card timings, used source and asset IDs, and the exact source-page URL. Older exports remain viewable but need a compliant new render before approval.

## Private preview and final production

Automatic previews use local `say` on macOS or `espeak-ng` on Linux, [evidence-linked visual planning](VISUAL_PLANNING.md), source overlays and estimated WebVTT timing. Country locators, document highlights and dated-context timelines use saved evidence without another model call. Both renderer engines share this plan and a common burned-in caption layout. Unsupported visual context remains a transparent fallback with coverage warnings. Per-job provider selection overrides configured paid narration/captions without changing process-wide settings. FFmpeg/ffprobe and the selected local voice must be installed. The manifest records the actual production profile, private-preview status, warnings, sources, exact visual evidence and measured timings.

Private preview gates retain factual support, exact passages, source lineage, contradiction, translation and asset-rights checks. Human claim review, provisional source metadata and a missing event date can wait for the private preview. An unknown date is displayed as **Date pending**, never replaced with retrieval or publication time; malformed supplied dates still block production. All of these checks remain required for final production/approval.

Every automatic frame is labelled **PRIVATE PREVIEW · EDITORIAL REVIEW PENDING**. The UI shows warnings and the actual voice. Source metadata and claim review flags remain unchecked. An automatic preview cannot be approved, including if all remaining editorial checks are later cleared. Complete those checks and use **Create final render after review**, then inspect that exact version before approval. Existing publishing pause and account requirements remain in force.

Version checks prevent stale results from replacing an edited story. A unique active-job index prevents duplicate concurrent scheduling. Preparation and rendering persist separately; a saved script can continue into rendering after a restart. Failed/expired jobs stop into review. Explicit continuation of a failed attempt creates a new content version and retains the old job/history. No paid request is retried automatically.

This feature creates private review artifacts. It does not publish, approve evidence, monitor feeds continuously, authenticate footage, or resolve gaps that require further research.
