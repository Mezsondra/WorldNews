import sharp from "sharp";
import { readFile } from "node:fs/promises";
import type { Story, RenderedShot } from "../shared/types.js";
import { sourcesFor } from "./editorial-plan.js";
import { safeFile } from "./moneyprinterturbo.js";
import { sourcePageUrl } from "./production-record.js";
import { evidenceGraphic } from "./visual-graphics.js";
import { visualLabel } from "../shared/visuals.js";

export const xml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function wrapText(text: string, width: number) {
  const result: string[] = [];
  let line = "";
  for (const word of text.replace(/\s+/g, " ").trim().split(" ")) {
    if (line && (line + " " + word).length > width) {
      result.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) result.push(line);
  return result;
}
const text = (
  value: string,
  x: number,
  y: number,
  size: number,
  width: number,
  fill = "#f7f5ed",
  weight = 400,
) =>
  `<text x="${x}" y="${y}" fill="${fill}" font-family="sans-serif" font-size="${size}" font-weight="${weight}">${wrapText(
    value,
    width,
  )
    .map(
      (line, i) =>
        `<tspan x="${x}" dy="${i ? size * 1.22 : 0}">${xml(line)}</tspan>`,
    )
    .join("")}</text>`;
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">${body}</svg>`;
export function shotOverlay(
  story: Story,
  shot: RenderedShot,
  preview: boolean,
) {
  const asset = story.assets.find((a) => a.id === shot.assetId);
  const context = asset?.graphic
    ? "ORIGINAL EXPLAINER · SOURCE-LINKED GRAPHIC"
    : asset?.sourceMedia
      ? `${asset.archive ? "ARCHIVE / CONTEXT · " : ""}${asset.mediaType === "video" ? "SOURCE FOOTAGE" : "SOURCE PHOTO"} · ${asset.sourceMedia.captureDate ? "Captured " + asset.sourceMedia.captureDate.slice(0, 10) : "Published " + (asset.sourceMedia.publishedAt?.slice(0, 10) || "undated") + " · capture date unknown"}`
      : asset
        ? `${asset.subject || "Context photo"} · ${asset.archive ? "ARCHIVE" : "PHOTO"} · ${asset.eventDate}`
        : shot.kind === "sources"
          ? "SOURCE RECORDS · PUBLICATION DATES"
          : shot.kind === "document"
            ? "DOCUMENT EXCERPT · SAVED EVIDENCE"
            : shot.kind === "map"
              ? "LOCATOR · GEOGRAPHIC CONTEXT"
              : shot.kind === "timeline"
                ? "TIMELINE · SOURCE-DATED CONTEXT"
                : `${visualLabel(shot.kind).toUpperCase()} · LINKED NARRATION`;
  return svg(
    `<defs><linearGradient id="foot" x2="0" y2="1"><stop stop-color="#0e201c" stop-opacity="0"/><stop offset=".25" stop-color="#0e201c" stop-opacity=".97"/></linearGradient></defs><rect y="1430" width="1080" height="490" fill="url(#foot)"/><rect x="72" y="100" width="7" height="31" fill="#bed897"/>${text("WORLD NEWS", 96, 126, 30, 40, "#fff", 700)}${text(story.category.toUpperCase(), 770, 126, 23, 18, "#bed897")}${text(context, 72, 1500, 25, 65, "#ccdac7")}${text("Credit: " + shot.credit, 72, 1580, 31, 52, "#f0f1e7")}${text(story.demo ? "HISTORICAL DEMO" : preview ? "PRIVATE PREVIEW · REVIEW PENDING" : "EDITORIAL DRAFT", 72, 1755, 24, 65, "#bed897")}${text("Sources · " + sourcePageUrl(story).replace(/^https?:\/\//, ""), 72, 1800, 25, 60, "#b5c7bb")}`,
  );
}
export function openingHeadline(story: Story) {
  let size = 68;
  while (
    wrapText(story.title, Math.floor(900 / (size * 0.57))).length * size * 1.2 >
    220
  )
    size -= 2;
  return svg(
    `<rect y="145" width="1080" height="245" fill="#0e201c" fill-opacity=".93"/>${text(story.title, 72, 215, size, Math.floor(900 / (size * 0.57)), "#fff", 700)}`,
  );
}
export function graphic(story: Story, shot: RenderedShot) {
  if (shot.visual) return evidenceGraphic(story, shot.visual);
  const segment = story.segments.find((s) => s.id === shot.segmentId)!;
  const sources = sourcesFor(story, segment.id)
    .filter((s, i, a) => a.findIndex((v) => v.publisher === s.publisher) === i)
    .slice(0, 4);
  let body = `<rect width="1080" height="1920" fill="#10251f"/><circle cx="1020" cy="630" r="480" fill="#17382d"/><path d="M72 430h115" stroke="#bed897" stroke-width="8"/>`;
  if (shot.kind === "sources") {
    body +=
      text("THE SOURCE RECORD", 72, 370, 30, 40, "#bed897", 700) +
      text("How we know", 72, 550, 88, 24, "#fff", 700);
    for (const [i, source] of sources.entries()) {
      body +=
        text(
          String(i + 1).padStart(2, "0"),
          72,
          720 + i * 125,
          32,
          4,
          "#bed897",
        ) +
        text(source.publisher, 150, 720 + i * 125, 43, 32, "#fff", 600) +
        text(
          "Published " +
            (source.publishedAt?.slice(0, 10) || "date unconfirmed"),
          150,
          768 + i * 125,
          27,
          50,
          "#b3c6b9",
        );
    }
  } else {
    const firstSentence = shot.label;
    const excerpt =
      firstSentence.length <= 220
        ? firstSentence
        : firstSentence.slice(0, 200).replace(/\s+\S*$/, "") + "…";
    let size = 76;
    while (
      wrapText(excerpt, Math.floor(900 / (size * 0.57))).length * size * 1.22 >
      480
    )
      size -= 2;
    body +=
      text("FROM THE REPORT", 72, 370, 30, 40, "#bed897", 700) +
      text(
        excerpt,
        72,
        590,
        size,
        Math.floor(900 / (size * 0.57)),
        "#fff",
        600,
      );
  }
  return svg(body);
}
export async function shotMaterial(story: Story, shot: RenderedShot) {
  const asset = story.assets.find((a) => a.id === shot.assetId);
  if (shot.kind !== "media" || !asset)
    return sharp(Buffer.from(graphic(story, shot)))
      .png()
      .toBuffer();
  if (asset.mediaType === "video") return undefined;
  const original = await readFile(await safeFile(asset.file));
  if (asset.graphic)
    return sharp(original)
      .resize(1080, 1920, { fit: "contain", background: "#10251f" })
      .png()
      .toBuffer();
  const background = await sharp(original)
    .resize(1080, 1920, { fit: "cover", position: sharp.strategy.attention })
    .blur(40)
    .modulate({ brightness: 0.35 })
    .png()
    .toBuffer();
  const foreground = await sharp(original)
    .resize(1008, 1050, {
      fit: shot.framing === "contain" ? "inside" : "cover",
      position: sharp.strategy.attention,
    })
    .png()
    .toBuffer();
  const framed =
    shot.framing === "detail"
      ? await sharp(foreground)
          .resize(1210, 1260, {
            fit: "cover",
            position: sharp.strategy.attention,
          })
          .extract({ left: 101, top: 105, width: 1008, height: 1050 })
          .png()
          .toBuffer()
      : foreground;
  const meta = await sharp(framed).metadata();
  return sharp(background)
    .composite([
      {
        input: framed,
        left: Math.round((1080 - meta.width!) / 2),
        top:
          shot.framing === "contain"
            ? 330 + Math.round((1050 - meta.height!) / 2)
            : 330,
      },
    ])
    .png()
    .toBuffer();
}
