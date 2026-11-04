import { lookup } from "node:dns/promises";
import https from "node:https";
import http from "node:http";
import { createHash } from "node:crypto";
import ipaddr from "ipaddr.js";
import * as cheerio from "cheerio";
import type { Source } from "../shared/types.js";
import { id, now } from "./domain.js";
export function isPublicAddress(address: string) {
  try {
    let addr = ipaddr.parse(address);
    if (addr.kind() === "ipv6" && (addr as ipaddr.IPv6).isIPv4MappedAddress())
      addr = (addr as ipaddr.IPv6).toIPv4Address();
    return addr.range() === "unicast";
  } catch {
    return false;
  }
}
export function validateUrl(value: string) {
  if (value.length > 2048)
    throw new Error("Source URL exceeds 2048 characters.");
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error(
      "Only public HTTP(S) pages on standard ports are supported.",
    );
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  )
    throw new Error("Private network sources are blocked.");
  if (ipaddr.isValid(hostname) && !isPublicAddress(hostname))
    throw new Error("Private network sources are blocked.");
  return url;
}
type Kind = "page" | "image" | "video" | "feed";
async function request(
  url: URL,
  kind: Kind = "page",
): Promise<{
  status: number;
  location?: string;
  body: string;
  bytes?: Buffer;
}> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(hostname, { all: true }),
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("Source DNS lookup exceeded 5 seconds.")),
        5000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error("Source resolves to a private or reserved network.");
  return new Promise((resolve, reject) => {
    const selected = addresses[0];
    const req = (url.protocol === "https:" ? https : http).get(
      url,
      {
        headers: {
          "User-Agent":
            "WorldNewsResearch/0.3 (https://github.com/Mezsondra/WorldNews; editorial source retrieval)",
          Accept: {
            page: "text/html,text/plain",
            image: "image/jpeg,image/png,image/webp",
            video: "video/mp4,video/webm",
            feed: "application/rss+xml,application/atom+xml,application/xml,text/xml",
          }[kind],
          "Accept-Encoding": "identity",
        },
        lookup: ((_host: unknown, _options: unknown, callback: Function) =>
          callback(null, [selected])) as any,
      },
      (res) => {
        if (
          res.statusCode &&
          [301, 302, 303, 307, 308].includes(res.statusCode)
        ) {
          res.resume();
          resolve({
            status: res.statusCode,
            location: res.headers.location,
            body: "",
          });
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Source returned HTTP ${res.statusCode}.`));
          return;
        }
        if (
          !{
            page: /text\/(html|plain)|application\/xhtml\+xml/,
            image: /^image\/(jpeg|png|webp)(;|$)/i,
            video: /^video\/(mp4|webm)(;|$)/i,
            feed: /xml/i,
          }[kind].test(res.headers["content-type"] || "")
        ) {
          res.resume();
          reject(
            new Error(
              kind === "feed"
                ? "Feed URL did not return RSS/Atom XML."
                : "Use an HTML or plain-text source; PDFs need manual extraction.",
            ),
          );
          return;
        }
        const image = kind === "image" || kind === "video";
        const limit =
          kind === "video" ? 60_000_000 : image ? 8_000_000 : 2_000_000;
        if (Number(res.headers["content-length"]) > limit) {
          res.destroy();
          reject(
            new Error(
              `Source ${kind} exceeds the ${limit / 1_000_000} MB retrieval limit.`,
            ),
          );
          return;
        }
        let bytes = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (
            bytes >
            (kind === "video" ? 60_000_000 : image ? 8_000_000 : 2_000_000)
          ) {
            req.destroy(
              new Error(
                kind === "video"
                  ? "Video exceeds the 60 MB retrieval limit."
                  : image
                    ? "Image exceeds the 8 MB retrieval limit."
                    : "Source exceeds the 2 MB retrieval limit.",
              ),
            );
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status: 200,
            body: image ? "" : Buffer.concat(chunks).toString("utf8"),
            ...(image ? { bytes: Buffer.concat(chunks) } : {}),
          }),
        );
        res.on("error", reject);
      },
    );
    const deadline = setTimeout(
      () => req.destroy(new Error("Source retrieval exceeded 15 seconds.")),
      kind === "video" ? 45000 : 15000,
    );
    req.on("close", () => clearTimeout(deadline));
    req.on("error", reject);
  });
}
export function validateWikimediaImageUrl(value: string) {
  const url = validateUrl(value);
  if (
    url.protocol !== "https:" ||
    !["upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname) ||
    !url.pathname.startsWith("/wikipedia/commons/")
  )
    throw new Error(
      "Automatic media downloads must use Wikimedia's HTTPS image servers.",
    );
  url.search = "";
  url.hash = "";
  return url;
}
export async function retrieveWikimediaImage(value: string) {
  const result = await request(validateWikimediaImageUrl(value), "image");
  if (result.location || !result.bytes)
    throw new Error("Media redirect or empty image rejected.");
  return result.bytes;
}
export async function retrieveSourceMedia(
  value: string,
  kind: "image" | "video",
) {
  let url = validateUrl(value);
  for (let i = 0; i < 4; i++) {
    if (url.protocol !== "https:")
      throw new Error("Source media must use HTTPS.");
    const result = await request(url, kind);
    if (result.location) {
      url = validateUrl(new URL(result.location, url).href);
      continue;
    }
    if (!result.bytes?.length) throw new Error("Empty source media.");
    return result.bytes;
  }
  throw new Error("Too many media redirects.");
}
export async function retrieveMediaPage(value: string) {
  await assertRobots(value);
  return follow(value);
}
// RFC 9309: our group if named, else "*"; longest matching rule wins, Allow wins ties.
export function robotsAllows(
  robots: string,
  path: string,
  agent = "worldnewsresearch",
) {
  const groups: { agents: string[]; rules: [boolean, string][] }[] = [];
  let open = false;
  for (const raw of robots.split(/\r?\n/)) {
    const [key, ...rest] = raw.replace(/#.*/, "").split(":");
    const field = key.trim().toLowerCase(),
      value = rest.join(":").trim();
    if (field === "user-agent") {
      if (!open) groups.push({ agents: [], rules: [] });
      groups.at(-1)!.agents.push(value.toLowerCase());
      open = true;
    } else if ((field === "allow" || field === "disallow") && groups.length) {
      open = false;
      if (value) groups.at(-1)!.rules.push([field === "allow", value]);
    }
  }
  const pick = (match: (a: string) => boolean) =>
    groups.filter((g) => g.agents.some(match)).flatMap((g) => g.rules);
  const named = pick((a) => a !== "*" && agent.includes(a));
  const rules = named.length ? named : pick((a) => a === "*");
  let best: [boolean, string] | undefined;
  for (const rule of rules) {
    const pattern = rule[1]
      .replace(/[.+?^{}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    if (!new RegExp(`^${pattern}`).test(path)) continue;
    if (
      !best ||
      rule[1].length > best[1].length ||
      (rule[1].length === best[1].length && rule[0])
    )
      best = rule;
  }
  return best ? best[0] : true;
}
const robotsCache = new Map<string, { at: number; body: Promise<string> }>();
async function follow(value: string, kind: Kind = "page") {
  let url = validateUrl(value);
  for (let i = 0; i < 5; i++) {
    const r = await request(url, kind);
    if (!r.location) return { url, body: r.body };
    url = validateUrl(new URL(r.location, url).href);
  }
  throw new Error("Too many source redirects.");
}
async function assertRobots(value: string) {
  const url = validateUrl(value);
  let cached = robotsCache.get(url.origin);
  if (!cached || cached.at < Date.now() - 86_400_000) {
    // ponytail: an unreachable or missing robots.txt counts as allowed
    cached = {
      at: Date.now(),
      body: follow(`${url.origin}/robots.txt`).then(
        (r) => r.body,
        () => "",
      ),
    };
    robotsCache.set(url.origin, cached);
  }
  if (!robotsAllows(await cached.body, url.pathname + url.search))
    throw new Error(
      "The site's robots.txt disallows automated retrieval of this page.",
    );
}
// Automated research and feed polling respect robots.txt; editor-requested retrieval does not.
export async function retrieveAutomated(value: string): Promise<Source> {
  await assertRobots(value);
  return retrieve(value);
}
export async function retrieveFeed(value: string) {
  await assertRobots(value);
  return (await follow(value, "feed")).body;
}
export async function retrieve(value: string): Promise<Source> {
  let url = validateUrl(value),
    html = "";
  for (let i = 0; i < 5; i++) {
    const r = await request(url);
    if (r.location) {
      url = validateUrl(new URL(r.location, url).href);
      continue;
    }
    html = r.body;
    break;
  }
  if (!html) throw new Error("Too many source redirects.");
  const $ = cheerio.load(html);
  $("script,style,nav,footer,header,aside,noscript,iframe,form").remove();
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("h1").first().text() ||
    $("title").text() ||
    url.hostname;
  const publishedAt =
    $('meta[property="article:published_time"]').attr("content") ||
    $("time[datetime]").first().attr("datetime") ||
    "";
  const article = $("article").first().length
    ? $("article").first()
    : $("main").first().length
      ? $("main").first()
      : $("body");
  const text = article.text().replace(/\s+/g, " ").trim().slice(0, 100000);
  if (text.length < 100)
    throw new Error(
      "No readable article text found. JavaScript-only pages need another source.",
    );
  return {
    id: id(),
    url: url.href,
    title: title.trim().slice(0, 250),
    publisher:
      $('meta[property="og:site_name"]').attr("content") || url.hostname,
    author: $('meta[name="author"]').attr("content") || "",
    publishedAt,
    retrievedAt: now(),
    hash: createHash("sha256").update(text).digest("hex"),
    text,
    language: ($("html").attr("lang") || "und").split("-")[0],
    lineage: url.hostname,
    kind: "secondary",
    usage:
      "Editor-requested text retrieval. Source and media usage terms require review.",
  };
}
