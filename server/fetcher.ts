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
async function request(
  url: URL,
  image = false,
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
          Accept: image
            ? "image/jpeg,image/png,image/webp"
            : "text/html,text/plain",
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
          !(
            image
              ? /^image\/(jpeg|png|webp)(;|$)/i
              : /text\/(html|plain)|application\/xhtml\+xml/
          ).test(res.headers["content-type"] || "")
        ) {
          res.resume();
          reject(
            new Error(
              "Use an HTML or plain-text source; PDFs need manual extraction.",
            ),
          );
          return;
        }
        let bytes = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > (image ? 8_000_000 : 2_000_000)) {
            req.destroy(
              new Error(
                image
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
      15000,
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
  const result = await request(validateWikimediaImageUrl(value), true);
  if (result.location || !result.bytes)
    throw new Error("Media redirect or empty image rejected.");
  return result.bytes;
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
