# Source photos, portraits and video

Automatic production checks the story's attached news reports for photos and video before falling back to Commons context images. Existing stories use **Preview → Photos & source videos → Find photos & videos and rebuild preview**. Rebuilding refreshes automatic selections; explicit manual scene selections are preserved. No AI media or paid media API is used.

## What appears in the preview

- Source photos retain the photographer/agency credit when supplied, plus the publisher and original report link. The article byline is never silently used as a photo credit.
- Direct MP4/WebM source videos become muted excerpts of up to 24 seconds. The renderer places actual moving footage in the scene and keeps the story's narration. Publisher framing and watermarks are retained. Embedded-only, DRM, paywall and social video players are not downloaded.
- Named people in narration or attached reports can receive archive portraits from Commons. Portraits must match the person's name; CEO portraits must also match the organization inferred from the source context when available. Portraits display the person's name and archive date.
- Scene selection prefers footage, named portraits, people in source photographs and variety. Old automatically selected building photos can be replaced. Uploaded/manual visuals remain available.
- Publication dates and capture dates are recorded separately. A publisher's publication/upload date is never presented as the date a photograph/video was captured.
- Credits remain visible in rendered scenes, the media panel, the citation manifest and the source page. Source media stays pending context/reuse review for final production; credit alone is not recorded as a reuse license.

## Retrieval bounds

Source discovery inspects at most eight attached reports, twelve candidates per report, and nine media-download attempts. It stores at most four source photos and two video clips per run. JSON-LD article images and related video objects, Open Graph images, and captioned body figures are supported. Related-story sidebars, unrelated video recommendations, logos, error pages and unsupported URLs are excluded. Sources that cannot be read remain in the visual-research report.

Downloads use HTTPS with public-address validation and pinned DNS, including redirects. Images are bounded to 8 MB, 40 megapixels, one raster page, and a minimum 600×350 resolution. Videos are bounded to 60 MB, decoded locally with network protocols disabled, limited to 30 minutes and 9 megapixels, and normalized to muted 24 fps H.264 excerpts. Stored metadata includes the original URL, retrieval time, SHA-256 and transformations. Discovery can be disabled with `MEDIA_DISCOVERY_ENABLED=false`.

Commons raster images retain creator, capture date, license and original file links. The supported licenses remain CC BY, CC BY-SA, CC0 and public domain. When publisher media or a matching portrait is unavailable, the existing conservative place/context search and text fallback remain available.

## Local verification

The Binance preview now includes an NBC News clip, a Binance-credited archive photograph of Richard Teng, and a source photograph credited to Romain Doucelin / NurPhoto / picture alliance through DW. The Poland preview includes Bogdan Święczkowski's archive portrait and photographs from the attached reports. Earlier building-only previews remain in version history. No export was approved or published.
