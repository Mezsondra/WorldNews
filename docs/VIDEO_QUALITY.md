# Automatic video checks and bounded repairs

New exports carry a versioned quality report in the render record, manifest and `quality.json` next to the video. Preview shows the measurements, repairs, hold reasons and playback links. An inspectable file is not automatically ready: the worker marks failed checks as blocked while retaining the private output. Final approval requires a current passing report bound to the saved story and render inputs. Earlier exports remain inspectable but need rebuilding before final approval.

## What is checked

- The existing 140–205-word, 60–90-second narration contract, separately timed complete closing sources and final video duration. Credits cannot satisfy the narration minimum.
- A current separate complete-package evidence receipt covering headline, summary, narration, on-screen assertions and publishing copy. Legacy narration-only checks do not satisfy automatic readiness. Exact source passages, attribution, translation and origin gates remain in force.
- Current typed visual evidence, clause matching, known media context conflicts, uninterrupted 3–10-second shot timing and at least 90% purposeful visual coverage. Unreviewed source-image identity/context is a hold. A single supported visual treatment is a review note, never a reason to invent variety.
- Captions retain every script word in order, use valid non-overlapping timestamps inside narration, fit two lines within 936 pixels at the configured font, remain for 0.65–6 seconds and require no more than 22 characters per second. Font glyphs are measured rather than assuming equal character widths. Recognition differences require attention; estimated timing remains explicitly disclosed for playback review.
- The final narration portion measures between -19 and -13 LUFS, with true peak at most -1 dBTP. Silence of at least 1.5 seconds below -45 dB is held for inspection. Closing-card silence is excluded.
- The actual final file is 1080×1920, 24 fps, H.264/YUV420P with AAC audio, agrees with saved timing and decodes completely. Hashes of inspected video and narration are recorded. These are production checks, not proof of image authenticity, factual truth, pronunciation or frame-by-frame aesthetics.

The thresholds are project policy, not a claim that these checks certify BBC, CNN or DW quality. Human review and the varied editorial trial remain necessary. Missing measurements hold the result.

## Bounded repairs

1. During full-story construction, the checked draft is spoken with the local preview voice and measured. If it fails 60–90 seconds, one remaining writer attempt can add useful documented context or condense the story. Every assertion is checked again. This stays within the existing two drafts, one context pass, five provider calls and one US$2.50 construction reservation. Exhausted attempts hold; no new revision or allowance is created to retry. A later paid voice is measured again during rendering; transport errors and uncertain paid operations are never retried automatically.
2. One visual pass can replace text fallbacks with an already eligible exact-clause evidence graphic that has enough reading time. Existing relevance filters exclude unsuitable media. Missing useful evidence or imagery remains a hold; this pass does not generate event pictures, infer chart data, download more assets or assert reuse permission.
3. One caption-layout pass reflows text and, if necessary, regroups words using their own timing spans. It preserves every word and pauses. If no readable partition exists, the check holds instead of stretching timestamps or deleting text.
4. Out-of-range audio gets one measured normalization to -16 LUFS / -3.5 dBTP. Original scene audio stays cached; no playback-speed change, silence padding or new speech request is used. AAC delivery uses 192 kb/s and extra peak headroom. The encoded final audio is measured again against the unchanged -1 dBTP limit, so an unsuccessful repair still holds.

Narration, caption-provider results and visual shots retain their existing content caches. A visual-only rebuild reuses unchanged audio and shots. Local repairs do not reserve model usage. Paid construction and selected narration/caption calls use the persistent pilot ledger; no budget limit is increased by these changes. Public posting remains disabled.

## Evidence handling learned from the saved-story trial

English sources must use their actual passage; a writer-provided English paraphrase in the translation field is rejected and cannot supply numbers, quotations or graphics. Non-English translations remain provisional and require review. Clearly marked `Read more Read less` related-story tails are excluded from the bounded model evidence catalog while the original source snapshot remains intact. The writer/checker must still distinguish article evidence from recommendations, player notices and other page furniture. General extraction and semantic source authentication remain imperfect.

Invalid structured drafts now save specific field errors for the next bounded repair. Overlong copy no longer triggers a context search merely because it contains too many words. None of these repairs relax the factual, duration or rights requirements.

## Remaining operating work

Run the varied ten-story evaluation and seven-day private trial, establish recurring budgets and lead admission, and test reconciliation, monitoring and recovery. Broad semantic media checks, source freshness and a production narrator/caption assessment are still open. Publishing integration follows those evaluations.

Spoken-number spelling and the explicitly supported USAGov acronym forms are compared literally for caption checking. Month dates may use ordinal speech. Changed quantities, names, negations and word boundaries still hold; the alignment stores the full spoken number span, including multiword numbers such as 435. Original explainer graphics keep their full canvas, are labelled separately from photos and can be tied to specific narration clauses.
