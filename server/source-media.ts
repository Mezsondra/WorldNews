import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import sharp from "sharp";
import type { Asset, Source, Story } from "../shared/types.js";
import { dataDir } from "./db.js";
import { id, now } from "./domain.js";
import {
  retrieveMediaPage,
  retrieveSourceMedia,
  validateUrl,
} from "./fetcher.js";
import type { VisualResult } from "./media-discovery.js";

const run = promisify(execFile);
const clean = (value: unknown) =>
  typeof value === "string"
    ? cheerio
        .load(value)
        .root()
        .text()
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1000)
    : "";
const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const words = (s: string) => norm(s).match(/[\p{L}\p{N}]{4,}/gu) || [];
const stop = new Set([
  "with",
  "from",
  "that",
  "this",
  "says",
  "said",
  "news",
  "behind",
  "billion",
  "million",
  "report",
  "reporting",
  "photo",
  "image",
]);
const terms = (s: string) => [...new Set(words(s).filter((w) => !stop.has(w)))];
export interface SourceMediaCandidate {
  url: string;
  kind: "image" | "video";
  title: string;
  caption: string;
  credit: string;
  sourceId: string;
  sourceUrl: string;
  publisher: string;
  publishedAt: string;
  captureDate?: string;
  people: boolean;
}
const urlOf = (value: any): string =>
  typeof value === "string" ? value : value?.contentUrl || value?.url || "";
const array = (v: any): any[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const hasType = (v: any, pattern: RegExp) =>
  array(v?.["@type"]).some((t) => pattern.test(String(t)));
export function mediaIdentity(raw: string, base: string) {
  try {
    let url = new URL(raw, base);
    const nested = url.searchParams.get("url") || url.searchParams.get("src");
    if (nested) url = new URL(nested, url);
    return decodeURIComponent(url.pathname)
      .split("/")
      .filter(Boolean)
      .pop()!
      .replace(/^\d+x\d+_/, "")
      .replace(/^\d+px-/, "")
      .replace(/_\d+\.(jpg|webp)$/, ".jpg");
  } catch {
    return raw;
  }
}
export function parseSourceMedia(
  html: string,
  source: Source,
): SourceMediaCandidate[] {
  const $ = cheerio.load(html);
  const nodes: any[] = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const add = (node: any) => {
        if (!node || typeof node !== "object" || nodes.length >= 300) return;
        if (Array.isArray(node)) return node.forEach(add);
        nodes.push(node);
        if (node["@graph"]) add(node["@graph"]);
        // Only article-associated media; do not walk recommendation/item lists.
        if (node.video) add(node.video);
      };
      add(JSON.parse($(el).text()));
    } catch {
      /* Some publishers emit invalid JSON-LD; HTML metadata still works. */
    }
  });
  const articles = nodes.filter((n) =>
    hasType(n, /^(NewsArticle|Article|ReportageNewsArticle)$/),
  );
  const article = articles[0];
  const publishedAt = clean(
    article?.datePublished ||
      $('meta[property="article:published_time"]').attr("content") ||
      source.publishedAt,
  );
  const pageTitle = clean(
    $('meta[property="og:title"]').attr("content") ||
      article?.headline ||
      $("h1").first().text(),
  );
  // An error/redirect page must not contribute its stock imagery.
  const expected = terms(source.title);
  if (!pageTitle || !expected.some((w) => norm(pageTitle).includes(w)))
    return [];
  const sourceTerms = terms(source.title);
  const result: SourceMediaCandidate[] = [];
  const mainCredit = clean(
    $("em")
      .filter((_i, e) => /main image credit:/i.test($(e).text()))
      .first()
      .text(),
  ).replace(/^main image credit:\s*/i, "");
  function add(
    rawUrl: string,
    kind: "image" | "video",
    title: string,
    caption: string,
    credit: string,
    captureDate?: string,
    depiction = caption,
  ) {
    try {
      if (!rawUrl) return;
      const url = validateUrl(new URL(rawUrl, source.url).href);
      if (url.protocol !== "https:" || result.some((c) => c.url === url.href))
        return;
      if (kind === "video" && !/\.(mp4|webm)$/i.test(url.pathname)) return;
      if (
        /logo|avatar|gravatar|icon|placeholder|social-default|\/static\/media\//i.test(
          url.pathname,
        )
      )
        return;
      title = clean(title);
      caption = clean(caption);
      credit = clean(credit);
      result.push({
        url: url.href,
        kind,
        title: title || source.title,
        caption: caption || title || source.title,
        credit:
          credit ||
          `Source: ${source.publisher} (individual creator not supplied)`,
        sourceId: source.id,
        sourceUrl: source.url,
        publisher: source.publisher,
        publishedAt,
        captureDate,
        people:
          /\b(portrait|president|minister|judges?|leader|officers?|protesters?|woman|man|people|chief|interview|speaking|founder|ceo)\b/i.test(
            depiction.slice(0, 180),
          ),
      });
    } catch {
      /* Invalid/non-public media URL. */
    }
  }
  const images = articles
    .flatMap((a) => array(a.image))
    .map((image) => {
      if (image?.["@id"])
        return nodes.find((n) => n["@id"] === image["@id"] && n.url) || image;
      return image;
    });
  const og = $('meta[property="og:image"]').attr("content");
  if (og) images.push(og);
  for (const obj of images.slice(0, 8)) {
    const raw = urlOf(obj);
    if (!raw) continue;
    // Match by filename because publisher crops use different URLs for the same photograph.
    const filename = mediaIdentity(raw, source.url);
    const img = $("img")
      .filter((_i, e) =>
        [
          $(e).attr("src"),
          $(e).attr("data-src"),
          $(e).attr("data-lazy-src"),
          $(e)
            .attr("srcset")
            ?.split(/,\s+(?=https?:)/)[0]
            ?.split(/\s/)[0],
        ].some(
          (s) => !!s && !!filename && mediaIdentity(s, source.url) === filename,
        ),
      )
      .first();
    let container = img.closest(
      "figure, .imagewrap, .image, .picture, .article__picture",
    );
    if (!container.length) container = img.parent().parent();
    for (
      let depth = 0;
      depth < 4 &&
      container.length &&
      !container.find(
        "[class*='credit'],[class*='copyright'],[class*='caption__source']",
      ).length;
      depth++
    ) {
      const parent = container.parent();
      if (
        !parent.length ||
        parent.is("body,main,article") ||
        parent.find("img").length > 3
      )
        break;
      container = parent;
    }
    const caption = clean(
      obj?.caption ||
        container.find("figcaption, [class*='caption']").first().text() ||
        img.attr("alt") ||
        $('meta[property="og:image:alt"]').attr("content") ||
        source.title,
    );
    const credit = clean(
      obj?.creditText ||
        obj?.copyrightNotice ||
        obj?.creator?.name ||
        container
          .find(
            "[class*='credit'],[class*='copyright'],[class*='caption__source']",
          )
          .filter(
            (_i, e) =>
              !$(e).children().length &&
              !/^copyright\s*$/i.test($(e).text().trim()),
          )
          .first()
          .text() ||
        mainCredit ||
        caption.match(/Photo by ([^)]+)\)/i)?.[1] ||
        caption.match(
          /(?:Image:|Credit:|Photo:|\||—|\[)([^\[\]]*(?:Reuters|AFP|Associated Press|Getty|PAP)[^\[\]]*)/i,
        )?.[1],
    );
    add(
      raw,
      "image",
      clean(obj?.name) || caption,
      caption,
      credit,
      clean(obj?.dateCreated) || undefined,
      clean(obj?.caption || img.attr("alt") || ""),
    );
  }
  // Body figures carry useful additional people/event photographs. Exclude related links.
  $(
    "article figure, .article-body figure, .wysiwyg figure, .entry-content figure, .storytext .imagewrap",
  ).each((_i, el) => {
    const figure = $(el);
    if (
      figure.closest("aside,nav,[class*='related'],[class*='recommend']")
        .length ||
      figure
        .find("a[href]")
        .filter(
          (_j, e) =>
            !/\.(jpg|jpeg|png|webp)(\?|$)/i.test($(e).attr("href") || ""),
        ).length
    )
      return;
    const img = figure.find("img").first();
    const caption = clean(
      figure.find("figcaption,.caption").first().text() || img.attr("alt"),
    );
    if (!caption || !sourceTerms.some((w) => norm(caption).includes(w))) return;
    const raw =
      img.attr("data-src") ||
      img.attr("data-lazy-src") ||
      img.attr("src") ||
      "";
    const credit = clean(
      figure.find("[class*='credit']").first().text() ||
        caption.match(/\[([^\]]+)\]\s*$/)?.[1],
    );
    add(raw, "image", caption, caption, credit);
  });
  for (const video of nodes.filter((n) => hasType(n, /^VideoObject$/))) {
    const title = clean(video.name || video.description);
    if (!sourceTerms.some((w) => norm(title).includes(w))) continue;
    add(
      urlOf(video.contentUrl),
      "video",
      title,
      clean(video.description),
      clean(
        video.creditText ||
          video.creator?.name ||
          video.publisher?.name ||
          source.publisher,
      ),
      undefined,
    );
  }
  $("video").each((_i, el) => {
    const video = $(el),
      title = clean(
        video.attr("aria-label") ||
          video.parent().find("h2,h3").first().text() ||
          video.attr("title"),
      );
    // Do not take an unrelated second video or a generic autoplay player.
    if (!sourceTerms.some((w) => norm(title).includes(w))) return;
    const raw =
      video
        .find('source[type="video/mp4"],source[type="video/webm"]')
        .first()
        .attr("src") ||
      video.attr("src") ||
      "";
    add(raw, "video", title, title, source.publisher);
  });
  return result.slice(0, 12);
}

export async function storeSourceMedia(
  story: Story,
  candidate: SourceMediaCandidate,
  download = retrieveSourceMedia,
): Promise<Asset> {
  const bytes = await download(candidate.url, candidate.kind);
  const assetId = id(),
    dir = path.join(dataDir, "assets", story.id);
  await mkdir(dir, { recursive: true });
  let file = `assets/${story.id}/${assetId}.png`,
    poster: string | undefined,
    duration: number | undefined;
  if (candidate.kind === "image") {
    const image = sharp(bytes, { limitInputPixels: 40_000_000 }),
      meta = await image.metadata();
    if (
      !["jpeg", "png", "webp"].includes(meta.format || "") ||
      !meta.width ||
      !meta.height ||
      meta.width < 600 ||
      meta.height < 350 ||
      (meta.pages || 1) !== 1
    )
      throw new Error("Photo resolution or format is unsuitable.");
    await image
      .rotate()
      .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
      .png()
      .toFile(path.join(dataDir, file));
  } else {
    const mp4 = bytes.subarray(4, 8).toString() === "ftyp";
    const webm = bytes
      .subarray(0, 4)
      .equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (!mp4 && !webm)
      throw new Error("Source video is not an MP4/WebM container.");
    const input = path.join(dir, `${assetId}.download`);
    await writeFile(input, bytes);
    try {
      const { stdout } = await run(
        "ffprobe",
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file",
          "-show_entries",
          "format=duration:stream=codec_type,width,height",
          "-of",
          "json",
          input,
        ],
        { timeout: 15000, maxBuffer: 100000 },
      );
      const probe = JSON.parse(stdout),
        stream = probe.streams?.find((s: any) => s.codec_type === "video");
      const total = Number(probe.format?.duration);
      if (
        !stream ||
        stream.width < 320 ||
        stream.height < 240 ||
        stream.width * stream.height > 9_000_000 ||
        !Number.isFinite(total) ||
        total < 2 ||
        total > 1800
      )
        throw new Error("Unsupported source video.");
      duration = Math.min(total, 24);
      file = `assets/${story.id}/${assetId}.mp4`;
      poster = `assets/${story.id}/${assetId}-poster.png`;
      await run(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-protocol_whitelist",
          "file",
          "-i",
          input,
          "-map",
          "0:v:0",
          "-t",
          String(duration),
          "-an",
          "-vf",
          "scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
          "-r",
          "24",
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "23",
          "-threads",
          "2",
          "-movflags",
          "+faststart",
          path.join(dataDir, file),
        ],
        { timeout: 120000, maxBuffer: 1000000 },
      );
      await run(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-ss",
          "1",
          "-i",
          path.join(dataDir, file),
          "-frames:v",
          "1",
          path.join(dataDir, poster),
        ],
        { timeout: 15000 },
      );
    } finally {
      await unlink(input).catch(() => {});
    }
  }
  const date = candidate.captureDate?.slice(0, 10);
  return {
    id: assetId,
    file,
    mediaType: candidate.kind,
    poster,
    creator: candidate.credit,
    permission: "Source credited · reuse permission unconfirmed",
    provenance: candidate.sourceUrl,
    eventDate: date || "Capture date unconfirmed",
    location: story.region || "Location unconfirmed",
    archive:
      !date ||
      (!!candidate.publishedAt && date < candidate.publishedAt.slice(0, 10)),
    context: `${candidate.caption}\nPublished by ${candidate.publisher}. ${date ? `Source media dated ${date}.` : "Capture date is not supplied by the publisher; publication date is shown separately."}`,
    sourceMedia: {
      sourceId: candidate.sourceId,
      title: candidate.title,
      publisher: candidate.publisher,
      credit: candidate.credit,
      downloadUrl: candidate.url,
      retrievedAt: now(),
      hash: createHash("sha256").update(bytes).digest("hex"),
      publishedAt: candidate.publishedAt,
      captureDate: candidate.captureDate,
      duration,
      people: candidate.people,
      reviewed: false,
      changes:
        candidate.kind === "video"
          ? "First 24 seconds maximum; resized, transcoded, original audio muted. Publisher framing retained."
          : "Resized and converted to PNG. Publisher framing retained.",
    },
  };
}

export async function discoverSourceVisuals(
  story: Story,
  load = retrieveMediaPage,
  download = retrieveSourceMedia,
): Promise<VisualResult> {
  const result: VisualResult = {
    assets: [],
    warnings: [],
    candidates: [],
    query: "Photos and video from attached source reports",
  };
  if (process.env.MEDIA_DISCOVERY_ENABLED === "false") return result;
  const sources = story.sources
    .filter((s) => !/wikipedia\.org/.test(new URL(s.url).hostname))
    .slice(0, 8);
  const candidates: SourceMediaCandidate[] = [];
  const pages = await Promise.allSettled(
    sources.map(async (source) => {
      const page = await load(source.url);
      return parseSourceMedia(page.body, { ...source, url: page.url.href });
    }),
  );
  pages.forEach((page, i) => {
    if (page.status === "fulfilled") candidates.push(...page.value);
    else
      result.candidates.push({
        title: sources[i].publisher,
        status: "failed",
        reason:
          page.reason instanceof Error
            ? page.reason.message
            : "Source page unavailable",
      });
  });
  candidates.sort(
    (a, b) =>
      Number(b.kind === "video") - Number(a.kind === "video") ||
      Number(b.people) - Number(a.people),
  );
  const seen = new Set(
    story.assets.map((a) => a.sourceMedia?.downloadUrl).filter(Boolean),
  );
  let videos = 0,
    photos = 0,
    attempts = 0;
  const imageKeys = new Set<string>();
  for (const candidate of candidates) {
    if (attempts >= 9 || (videos >= 2 && photos >= 4)) break;
    if (
      seen.has(candidate.url) ||
      (candidate.kind === "video" ? videos >= 2 : photos >= 4)
    )
      continue;
    const key = mediaIdentity(candidate.url, candidate.sourceUrl);
    if (imageKeys.has(key)) continue;
    attempts++;
    try {
      const asset = await storeSourceMedia(story, candidate, download);
      if (
        [...story.assets, ...result.assets].some(
          (a) => a.sourceMedia?.hash === asset.sourceMedia?.hash,
        )
      )
        continue;
      result.assets.push(asset);
      seen.add(candidate.url);
      imageKeys.add(key);
      candidate.kind === "video" ? videos++ : photos++;
      result.candidates.push({ title: candidate.title, status: "stored" });
    } catch (error) {
      result.candidates.push({
        title: candidate.title,
        status: "failed",
        reason:
          error instanceof Error
            ? error.message.slice(0, 300)
            : "Source media unavailable",
      });
    }
  }
  result.warnings.push(
    `${photos} source photo(s) and ${videos} video clip(s) added with publisher/agency credits. Source media context and reuse review remains pending for final production.`,
  );
  return result;
}
