import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Story } from "../shared/types.js";
import type { ProductionRecord, SourceCard } from "../shared/production.js";

const exec = promisify(execFile);
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

function lines(value: string, width: number, max: number) {
  const words = value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .flatMap((w) => w.match(new RegExp(`.{1,${width}}`, "gu")) || []);
  const result: string[] = [];
  for (const word of words) {
    if (result.length && result.at(-1)!.length + word.length + 1 <= width)
      result[result.length - 1] += " " + word;
    else result.push(word);
  }
  if (result.length > max) result[max - 1] = result[max - 1].slice(0, -1) + "…";
  return result.slice(0, max);
}

const text = (
  value: string,
  x: number,
  y: number,
  size: number,
  width: number,
  max = 2,
  color = "#f7f5ed",
) =>
  `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${size}" fill="${color}">${lines(
    value,
    width,
    max,
  )
    .map(
      (line, i) =>
        `<tspan x="${x}" dy="${i ? size * 1.3 : 0}">${escape(line)}</tspan>`,
    )
    .join("")}</text>`;

export function sourceCardSvg(
  story: Story,
  record: ProductionRecord,
  card: SourceCard,
  preview: boolean,
) {
  const page = record.sourceCards.findIndex((c) => c.id === card.id);
  const entries = card.sourceIds
    .map((id, index) => {
      const source = story.sources.find((s) => s.id === id);
      if (!source) throw new Error("A closing source record is missing.");
      const y = 580 + index * 300;
      const number = record.sourceIds.indexOf(id) + 1;
      return (
        `<path d="M72 ${y - 45}h936" stroke="#3b5247"/>` +
        text(String(number).padStart(2, "0"), 72, y, 32, 3, 1, "#bed897") +
        text(source.publisher, 150, y, 34, 39, 1, "#bed897") +
        text(source.title, 150, y + 65, 42, 32, 3) +
        text(
          `Published ${source.publishedAt?.slice(0, 10) || "date not supplied"}`,
          150,
          y + 230,
          28,
          50,
          1,
          "#b9cabf",
        )
      );
    })
    .join("");
  // The complete address remains present even when a publisher/title is shortened.
  const address = record.sourcePage.replace(/^https?:\/\//, "");
  const addressLines = Math.ceil(address.length / 42);
  if (addressLines > 4)
    throw new Error(
      "The public source address is too long for readable end cards. Configure a shorter public hostname.",
    );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#10251f"/><rect x="72" y="118" width="7" height="32" fill="#bed897"/>${text("WORLD NEWS", 100, 147, 31, 30, 1)}${text(`REPORTING SOURCES · ${page + 1}/${record.sourceCards.length}`, 72, 310, 30, 50, 1, "#bed897")}${text("Read the evidence", 72, 420, 68, 24, 1)}${entries}${text("Full reports, evidence and visual credits", 72, 1510, 30, 55, 1, "#bed897")}${text(address, 72, 1580, 35, 42, 4)}${text(story.demo ? "HISTORICAL DEMO · NOT CURRENT NEWS" : preview ? "PRIVATE PREVIEW · REVIEW PENDING" : "EDITORIAL REVIEW REQUIRED", 72, 1820, 25, 60, 1, "#b9cabf")}</svg>`;
}

export async function renderSourceCards(
  story: Story,
  record: ProductionRecord,
  dir: string,
  preview: boolean,
  audio: boolean,
) {
  const files: string[] = [];
  for (const card of record.sourceCards) {
    const png = path.join(dir, `${card.id}.png`);
    const output = path.join(dir, `${card.id}.mp4`);
    const svg = sourceCardSvg(story, record, card, preview);
    await writeFile(path.join(dir, `${card.id}.svg`), svg);
    await sharp(Buffer.from(svg)).png().toFile(png);
    await exec(
      "ffmpeg",
      [
        "-y",
        "-loop",
        "1",
        "-framerate",
        "24",
        "-i",
        png,
        ...(audio ? ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono"] : []),
        "-t",
        String(card.end - card.start),
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "24",
        "-threads",
        "2",
        "-pix_fmt",
        "yuv420p",
        ...(audio
          ? ["-c:a", "aac", "-ar", "48000", "-ac", "1", "-b:a", "128k"]
          : ["-an"]),
        "-movflags",
        "+faststart",
        output,
      ],
      { timeout: 60000, maxBuffer: 2_000_000 },
    );
    files.push(path.basename(output));
  }
  return files;
}
