import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import sharp from "sharp";
import type { Asset, Story } from "../shared/types.js";
import { mediaGeographyCompatible } from "./media-context.js";
import { mediaRightsIssues } from "./media-rights.js";
import { dataDir, Store } from "./db.js";
import { id, invalidate, now } from "./domain.js";
import {
  retrieveWikimediaImage,
  validateWikimediaImageUrl,
} from "./fetcher.js";
import { json, type Fetcher } from "./providers.js";
import { discoverSourceVisuals } from "./source-media.js";

export interface VisualFocus {
  query: string;
  terms: string[];
  location: string;
  institution?: boolean;
  place?: boolean;
  person?: string;
  affiliation?: string;
}
export interface VisualResult {
  assets: Asset[];
  warnings: string[];
  candidates: { title: string; status: string; reason?: string }[];
  query: string;
}
const normalize = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export const plainMetadata = (html: string) => {
  const $ = cheerio.load(String(html));
  $("script,style,iframe").remove();
  return $.root().text().replace(/\s+/g, " ").trim();
};
export function visualFocus(story: Story): VisualFocus {
  if (/poland/i.test(story.title) && /constitution|tribunal/i.test(story.title))
    return {
      query:
        '"Constitutional Tribunal" Warsaw building filetype:bitmap -protest -demonstration',
      terms: ["constitutional", "tribunal"],
      location: "Poland",
      institution: true,
    };
  const terms = normalize(story.title)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(
      (t) =>
        t.length > 3 &&
        ![
          "crisis",
          "breaking",
          "update",
          "latest",
          "after",
          "before",
          "news",
          "begins",
          "with",
          "from",
          "into",
          "that",
          "this",
          "says",
          "said",
          "behind",
          "over",
          "billion",
          "million",
        ].includes(t),
    )
    .slice(0, 5);
  return {
    query: terms.join(" ") + " filetype:bitmap -protest -demonstration",
    terms,
    location:
      story.region !== "Global"
        ? story.region
        : "Location not independently established",
  };
}

// Proper nouns in a sentence-case headline, e.g. "FBI", "North Korea", "Binance".
export function headlineSubjects(title: string) {
  const words = title
    .split(/\s+/)
    .map((w) =>
      w.replace(/['’]s$/, "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""),
    );
  const long = words.filter((w) => w.length > 3);
  // In Title Case every word is capitalised, so capitals say nothing.
  if (long.filter((w) => /^\p{Lu}/u.test(w)).length > long.length / 2)
    return [];
  const subjects: string[] = [];
  let run: string[] = [];
  words.forEach((w, i) => {
    // A sentence's first word is only a name when written as an acronym.
    if (/^\p{Lu}/u.test(w) && (i > 0 || /^\p{Lu}{2,}$/u.test(w))) run.push(w);
    else (run.length && subjects.push(run.join(" ")), (run = []));
  });
  if (run.length) subjects.push(run.join(" "));
  return [...new Set(subjects)]
    .filter((s) => s.replace(/\P{L}/gu, "").length >= 3)
    .slice(0, 3);
}
// ponytail: place keywords decide "neutral context photo"; widen the lists when good photos are missed
const PLACE =
  /building|headquarters|hotel|station|skyline|street|exterior|tower|office|entrance|square|bridge|cityscape|panorama/;
const NOT_NEUTRAL =
  /press conference|parade|ceremony|gathering|marathon|meeting|\bvisit|\bseal\b|emblem|montage|t-shirt|\bcake\b|celebrat/;
// Close-ups of a wall or window are accurate but unrecognisable.
const DETAIL =
  /detail|close-?up|cladding|\bholes?\b|floor of|window|\bdoors?\b|plaque|\bsign\b|interior|ceiling|stair/;
export function visualFocuses(story: Story): VisualFocus[] {
  const focus = visualFocus(story);
  if (focus.institution) return [focus];
  const subjects = headlineSubjects(story.title);
  if (!subjects.length) return [focus];
  return subjects.map((subject) => ({
    query: `"${subject}" (building OR headquarters OR skyline OR street OR station OR hotel OR exterior) filetype:bitmap -protest -demonstration`,
    terms: normalize(subject).split(/\s+/),
    location: subject,
    place: true,
  }));
}

export function commonsCandidate(
  page: any,
  focus: VisualFocus,
): Omit<Asset, "id" | "file"> & { downloadUrl: string } {
  const info = page.imageinfo?.[0],
    metadata = info?.extmetadata || {};
  const meta = (key: string) => plainMetadata(metadata[key]?.value || "");
  if (
    !Number.isSafeInteger(page.pageid) ||
    !/^File:/.test(page.title || "") ||
    !info ||
    !/^image\/(jpeg|png|webp)$/.test(info.mime || "")
  )
    throw new Error("Not a supported raster photograph");
  const description = meta("ImageDescription"),
    subject = normalize(page.title + " " + description);
  // Old demonstrations, unrelated people and disputed-event imagery are not safe generic background.
  if (
    /protest|demonstration|rally|riot|battle|massacre|\bmap\b|\blogo\b|\bflag\b/i.test(
      subject,
    ) ||
    (!focus.person && /\bportrait\b/i.test(subject))
  )
    throw new Error(
      "Event/portrait/graphic imagery needs deliberate editorial selection",
    );
  if (focus.person) {
    if (!subject.includes(normalize(focus.person)))
      throw new Error("Portrait does not identify the named person");
    if (focus.affiliation && !subject.includes(normalize(focus.affiliation)))
      throw new Error(
        "Portrait does not establish the person's organization; possible namesake",
      );
  } else if (focus.institution) {
    if (
      !/polish|poland|warsaw|warszaw/.test(subject) ||
      !/constitutional tribunal|trybunal konstytucyjny/.test(subject) ||
      !/building|entrance|seat of|siedzib|wejscie|zima/.test(subject)
    )
      throw new Error(
        "Does not identify the relevant Polish tribunal building",
      );
    if (
      /president|judge|exhibition|andrzej|donald|karol/.test(
        normalize(page.title + " " + description),
      )
    )
      throw new Error("Not a neutral exterior/context image");
  } else if (focus.place) {
    if (
      !focus.terms.every((t) =>
        new RegExp(`(^|[^\\p{L}\\p{N}])${t}($|[^\\p{L}\\p{N}])`, "u").test(
          subject,
        ),
      )
    )
      throw new Error("Does not name the story's subject");
    if (!PLACE.test(subject) || NOT_NEUTRAL.test(subject))
      throw new Error("Not a neutral place or building photo");
    if (DETAIL.test(normalize(page.title)))
      throw new Error("A detail shot, not a recognisable view");
  } else if (
    focus.terms.length < 2 ||
    focus.terms.filter((term) => subject.includes(term)).length <
      Math.min(3, focus.terms.length)
  )
    throw new Error("Insufficient subject match; remains a lead only");
  const creator = meta("Artist"),
    date = meta("DateTimeOriginal").match(/^\d{4}(?:-\d{2}(?:-\d{2})?)?/)?.[0];
  if (
    !creator ||
    creator.length > 250 ||
    /^(unknown|anonymous|own work)$/i.test(creator)
  )
    throw new Error("Creator is missing or untraceable");
  if (!date) throw new Error("Photo creation date is missing");
  if (meta("Restrictions"))
    throw new Error("Additional reuse restrictions need review");
  const license = meta("LicenseShortName");
  if (!/^(CC BY(?:-SA)? \d\.\d(?: [a-z]+)?|CC0|Public domain)$/i.test(license))
    throw new Error("License is outside the supported reuse list");
  const rawLicenseUrl =
    meta("LicenseUrl") ||
    (license === "Public domain"
      ? "https://creativecommons.org/publicdomain/mark/1.0/"
      : "");
  const licenseUrl = new URL(rawLicenseUrl);
  if (
    licenseUrl.hostname !== "creativecommons.org" ||
    !/^\/(licenses\/(by|by-sa)\/|publicdomain\/(zero|mark)\/)/.test(
      licenseUrl.pathname,
    ) ||
    licenseUrl.username ||
    licenseUrl.password
  )
    throw new Error("A recognized license URL is required");
  licenseUrl.protocol = "https:";
  const expectedPath = /^CC BY-SA/i.test(license)
    ? "/licenses/by-sa/"
    : /^CC BY /i.test(license)
      ? "/licenses/by/"
      : license === "CC0"
        ? "/publicdomain/zero/"
        : "/publicdomain/mark/";
  if (!licenseUrl.pathname.startsWith(expectedPath))
    throw new Error("License name and URL disagree");
  const downloadUrl = validateWikimediaImageUrl(info.thumburl || info.url).href;
  const sourceUrl = `https://commons.wikimedia.org/?curid=${page.pageid}`;
  return {
    creator,
    subject: focus.person,
    permission: license,
    provenance: sourceUrl,
    eventDate: date,
    location: focus.location,
    archive: true,
    context: `Archive context photo: ${description || page.title.replace(/^File:/, "")}. It does not depict the current reported events.`,
    discovery: {
      provider: "wikimedia",
      pageId: page.pageid,
      title: page.title,
      sourceUrl,
      licenseUrl: licenseUrl.href,
      downloadUrl,
      hash: "",
      retrievedAt: now(),
      changes:
        "Resized, converted to PNG and cropped to fit the scene. Original image license applies; review ShareAlike obligations where applicable.",
      reviewed: false,
    },
    downloadUrl,
  };
}

export async function discoverVisuals(
  story: Story,
  request: Fetcher = fetch,
  download = retrieveWikimediaImage,
  selectedFocuses?: VisualFocus[],
): Promise<VisualResult> {
  const focuses = selectedFocuses || visualFocuses(story);
  const result: VisualResult = {
    assets: [],
    warnings: [],
    candidates: [],
    query: focuses.map((f) => f.query).join(" | "),
  };
  if (process.env.MEDIA_DISCOVERY_ENABLED === "false") {
    result.warnings.push(
      "Automatic photo discovery is disabled; text scenes remain available.",
    );
    return result;
  }
  try {
    for (const focus of focuses) {
      // Several subjects: one photo each, so every subject gets a chance.
      const limit = Math.min(
        3,
        result.assets.length + (focuses.length > 1 ? 1 : 3),
      );
      const url = new URL("https://commons.wikimedia.org/w/api.php");
      url.search = new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        generator: "search",
        gsrsearch: focus.query,
        gsrnamespace: "6",
        gsrlimit: "12",
        prop: "imageinfo",
        iiprop: "url|extmetadata|mime|size",
        iiurlwidth: "1600",
        iiextmetadatalanguage: "en",
        maxlag: "5",
      }).toString();
      const response = await request(url, {
        headers: {
          "User-Agent":
            "WorldNewsResearch/0.3 (https://github.com/Mezsondra/WorldNews; local editorial prototype)",
        },
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      const data = await json(response, "Wikimedia image search", 2_000_000);
      if (data.error)
        throw new Error(
          "Wikimedia image search is unavailable or rate limited",
        );
      const pages: any[] = Array.isArray(data.query?.pages)
        ? data.query.pages
            .slice(0, 12)
            .sort((a: any, b: any) => (a.index || 0) - (b.index || 0))
        : [];
      // A file named after the subject is usually a recognisable view, not a detail.
      if (focus.place) {
        const named = (p: any) =>
          focus.terms.every((t) => normalize(String(p.title)).includes(t));
        pages.sort((a, b) => Number(named(b)) - Number(named(a)));
      }
      let attempts = 0;
      for (const page of pages) {
        const title = String(page.title || "Unknown file").slice(0, 300);
        if (result.assets.length >= limit) break;
        let candidate;
        try {
          candidate = commonsCandidate(page, focus);
        } catch (error) {
          result.candidates.push({
            title,
            status: "skipped",
            reason:
              error instanceof Error ? error.message : "Metadata check failed",
          });
          continue;
        }
        if (
          [...story.assets, ...result.assets].some(
            (a) => a.discovery?.pageId === page.pageid,
          )
        ) {
          result.candidates.push({
            title,
            status: "skipped",
            reason: "Already stored",
          });
          continue;
        }
        if (++attempts > 5) break;
        try {
          const bytes = await download(candidate.downloadUrl);
          const image = sharp(bytes, { limitInputPixels: 40_000_000 });
          const metadata = await image.metadata();
          if (
            !["jpeg", "png", "webp"].includes(metadata.format || "") ||
            !metadata.width ||
            !metadata.height ||
            metadata.width < 600 ||
            metadata.height < 400 ||
            (metadata.pages || 1) !== 1
          )
            throw new Error("Image resolution/animation is unsuitable");
          const assetId = id(),
            file = `assets/${story.id}/${assetId}.png`;
          const stored = await image
            .rotate()
            .resize({
              width: 1920,
              height: 1920,
              fit: "inside",
              withoutEnlargement: true,
            })
            .png()
            .toBuffer();
          await mkdir(path.join(dataDir, "assets", story.id), {
            recursive: true,
          });
          await writeFile(path.join(dataDir, file), stored);
          const { downloadUrl: _url, ...fields } = candidate;
          result.assets.push({
            id: assetId,
            file,
            ...fields,
            discovery: {
              ...candidate.discovery!,
              hash: createHash("sha256").update(bytes).digest("hex"),
            },
          });
          result.candidates.push({ title, status: "stored" });
        } catch {
          result.candidates.push({
            title,
            status: "failed",
            reason: "Image download or raster validation failed",
          });
        }
      }
    }
    if (!result.assets.length && story.assets.some((a) => a.discovery))
      result.warnings.push(
        "Previously stored archive/context images remain in use; no new matching photo was added.",
      );
    else if (!result.assets.length)
      result.warnings.push(
        "No new photo passed subject, date, credit, license and download checks. Text fallback remains in use.",
      );
    else
      result.warnings.push(
        `${result.assets.length} archive context photo(s) retrieved from Wikimedia Commons. These are not current-event footage; review image identity and reuse obligations before final production.`,
      );
  } catch {
    result.warnings.push(
      "Automatic image search could not complete. Text fallback remains in use; no image was invented or taken from an unlicensed news page.",
    );
  }
  return result;
}

export function attachDiscoveredVisuals(story: Story, result: VisualResult) {
  const images = [
    ...result.assets,
    ...story.assets.filter((a) => a.sourceMedia || a.discovery),
  ];
  const uses = new Map<string, number>();
  let previous = "";
  return {
    ...story,
    assets: [...story.assets, ...result.assets],
    segments: story.segments.map((scene, index) => {
      const current = story.assets.find((a) => a.id === scene.assetId);
      // Keep deliberate manual selections; refresh old automatic building shots.
      if (
        scene.visualSelection === "manual" ||
        (scene.assetId &&
          (!current || (!current.discovery && !current.sourceMedia))) ||
        !images.length
      )
        return scene;
      const terms = normalize(scene.text).match(/[\p{L}\p{N}]{4,}/gu) || [];
      const sourceIds = new Set(
        scene.claimIds.flatMap(
          (cid) =>
            story.claims
              .find((c) => c.id === cid)
              ?.evidence.map((e) => e.sourceId) || [],
        ),
      );
      const score = (asset: Asset) => {
        const text = normalize(
          (asset.sourceMedia?.title || asset.discovery?.title || "") +
            " " +
            asset.context,
        );
        return (
          (asset.subject ? 24 : asset.sourceMedia ? 15 : 0) +
          (asset.sourceMedia?.people ? 8 : 0) +
          terms.filter((t) => text.includes(t)).length +
          (sourceIds.has(asset.sourceMedia?.sourceId || "") ? 3 : 0) +
          (asset.mediaType === "video" && index === 0 ? 12 : 0) -
          (uses.get(asset.id) || 0) * 20 -
          (asset.id === previous ? 25 : 0)
        );
      };
      const asset = images.filter(a => mediaGeographyCompatible(a, scene.text) && !mediaRightsIssues(a, "private-preview").length).sort((a, b) => score(b) - score(a))[0];
      if (!asset) return { ...scene, assetId: undefined, visualSelection: "automatic" as const };
      uses.set(asset.id, (uses.get(asset.id) || 0) + 1);
      previous = asset.id;
      return {
        ...scene,
        assetId: asset.id,
        visualSelection: "automatic" as const,
      };
    }),
    automation: story.automation
      ? {
          ...story.automation,
          warnings: [...story.automation.warnings, ...result.warnings],
        }
      : story.automation,
  };
}

export function peopleFocuses(story: Story): VisualFocus[] {
  const text =
    story.segments.map((s) => s.text).join(" ") +
    " " +
    story.sources.map((s) => s.text).join(" ");
  const matches = [
    ...text.matchAll(
      /\b(CEO|co-CEO|[Pp]resident|[Mm]inister|[Jj]udge|[Ll]eader)\s+([\p{Lu}][\p{L}\p{M}’'-]+(?:\s+[\p{Lu}][\p{L}\p{M}’'-]+){1,2})/gu,
    ),
  ];
  matches.sort((a, b) => Number(/CEO/.test(b[1])) - Number(/CEO/.test(a[1])));
  const seen = new Set<string>();
  return matches
    .filter((m) => {
      if (seen.has(m[2])) return false;
      seen.add(m[2]);
      return true;
    })
    .slice(0, 2)
    .map((match) => {
      const person = match[2];
      const preceding = text.slice(Math.max(0, match.index! - 60), match.index);
      const affiliation = /CEO/.test(match[1])
        ? preceding.match(/([\p{Lu}][\p{L}\p{N}-]+)\s+$/u)?.[1] ||
          headlineSubjects(story.title).at(-1)
        : undefined;
      return {
        person,
        affiliation,
        query: `"${person}" ${affiliation ? '"' + affiliation + '" ' : ""}filetype:bitmap -caricature -logo`,
        terms: normalize(person).split(/\s+/),
        location: story.region || "Location unconfirmed",
      };
    });
}

export async function discoverStoryMedia(story: Story): Promise<VisualResult> {
  const source = await discoverSourceVisuals(story);
  const people = peopleFocuses(story);
  if (people.length && !story.assets.some((a) => a.subject)) {
    const portraits = await discoverVisuals(
      story,
      fetch,
      retrieveWikimediaImage,
      people,
    );
    source.assets.push(...portraits.assets);
    source.candidates.push(...portraits.candidates);
    source.warnings.push(...portraits.warnings);
    source.query += " | " + portraits.query;
  }
  // Reuse stored source media on later revisions. Commons is a context fallback.
  if (source.assets.length >= 2 || story.assets.some((a) => a.sourceMedia))
    return source;
  const fallback = await discoverVisuals(story);
  return {
    assets: [...source.assets, ...fallback.assets],
    warnings: [...source.warnings, ...fallback.warnings],
    candidates: [...source.candidates, ...fallback.candidates],
    query: source.query + " | " + fallback.query,
  };
}

export async function addVisualsAndRebuild(store: Store, old: Story) {
  const result = await discoverStoryMedia(old);
  const next = invalidate(attachDiscoveredVisuals(old, result));
  next.automation = {
    enabled: true,
    state: "rendering",
    message: "Visual discovery complete; rebuilding the private video",
    warnings: next.automation?.warnings || result.warnings,
  };
  await store.snapshot(old);
  await store.save(next, old.version);
  await store.addReport({
    id: id(),
    storyId: old.id,
    version: next.version,
    kind: "visuals",
    createdAt: now(),
    data: {
      summary: `${result.assets.length} photos/video clips attached with source credits. Media review remains pending.`,
      query: result.query,
      candidates: result.candidates,
      cautions: result.warnings,
    },
  });
  await store.audit("automatic-visuals-attached", {
    storyId: old.id,
    version: next.version,
    assets: result.assets.length,
  });
  return next;
}
