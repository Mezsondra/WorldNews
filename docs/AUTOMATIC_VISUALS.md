# Automatic related photos

Automatic production now searches Wikimedia Commons after preparing narration, downloads suitable photographs, assigns them to empty scene slots, and renders a photo-led layout. Existing stories can use **Preview → Related photos → Find related photos & rebuild preview**. This creates a new version and private video without changing narration or spending AI credits. Manually selected visuals are preserved.

This adapter handles **raster photographs**, not automatic news-video footage. It does not copy news-site thumbnails, download social posts, or invent event imagery. Photos are archive/context illustrations, labelled with their recorded creation date. An institutional photo illustrates the institution; it does not prove a reported event occurred.

## Bounded discovery

- One Wikimedia query per job, at most 12 candidates, five image-download attempts and three stored photos.
- Conservative subject matching. The Poland constitutional-crisis resolver seeks exterior/entrance images of its Constitutional Tribunal. Other countries' courts, portraits, protests and exhibitions are excluded. Generic headlines require several distinctive subject terms; ambiguous subjects retain text fallback.
- JPEG/PNG/WebP only. Metadata must identify a creator, creation date, recognized CC BY/CC BY-SA/CC0/public-domain license and corresponding license URL. Additional restrictions or unsupported license terms exclude the asset.
- HTTPS downloads only from Wikimedia upload/thumbnail servers, without redirects. Public DNS addresses are validated and pinned. Each image is bounded to 8 MB, 40 megapixels, one raster page, minimum 600×400 resolution, and resized within 1920 pixels.
- Asset records retain creator, license/URL, Commons source, download URL, retrieval time, downloaded-file SHA-256, date, context and layout changes. The source page and manifest preserve credits. Frames show archive date, creator and license.

HTML metadata becomes plain text. Failures and skipped candidates remain visible in a **Visual research** report and preview warnings. Set `MEDIA_DISCOVERY_ENABLED=false` to disable discovery explicitly.

## Editorial review

Automatic photos remain unreviewed. A private preview can use their recorded license/context provisionally; final production requires **Confirm image identity, context & reuse rights** for each selected discovered image. Editors must verify depiction/source, retain attribution and license links, and satisfy ShareAlike/adaptation obligations. Confirmation creates a new version and invalidates approval; factual claim/source review remains separate.

The adapter uses [MediaWiki Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo) and follows [Wikimedia reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) and the file's specific [Creative Commons conditions](https://creativecommons.org/licenses/by-sa/3.0/pl/deed.en). Commons availability does not guarantee provenance or editorial suitability.

## Verified local run

On 1 November 2026, the Poland dossier retrieved two tribunal exterior/entrance photos by **Adrian Grycuk**, dated **22 January 2016**, under **CC BY-SA 3.0 pl**. Both remain archive-labelled and pending media review. The 35.47-second private video was rebuilt without another AI API reservation. The earlier text-only preview remains in history.
