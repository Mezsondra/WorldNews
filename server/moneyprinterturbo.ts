import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  access,
  readFile,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { Asset, Story } from "../shared/types.js";
import { dataDir } from "./db.js";
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = path.join(root, ".tools/moneyprinterturbo");
const python = path.join(
  home,
  "venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const source = path.join(home, "source");
const lock: { commit: string; repository: string; font: string } = JSON.parse(
  await readFile(
    path.join(root, "scripts/media/moneyprinterturbo.json"),
    "utf8",
  ),
);
export const mptVersion = lock.commit;
export async function moneyPrinterStatus() {
  try {
    const ready = JSON.parse(
      await readFile(path.join(home, "ready.json"), "utf8"),
    );
    if (ready.commit !== lock.commit) throw new Error("Setup is outdated");
    await Promise.all([
      access(python),
      access(path.join(source, "app/services/video.py")),
      access(path.join(home, "runtime/resource/fonts", lock.font)),
    ]);
    return {
      available: true,
      detail: "MoneyPrinterTurbo · local video, motion and captions",
    };
  } catch {
    return {
      available: false,
      detail:
        "Run npm run media:setup with Python 3.11+ to enable MoneyPrinterTurbo.",
    };
  }
}
export async function ensureMoneyPrinter() {
  const status = await moneyPrinterStatus();
  if (!status.available) throw new Error(status.detail);
}
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function wrap(text: string, max: number) {
  const result: string[] = [];
  let line = "";
  for (const word of text.replace(/\s+/g, " ").split(" ")) {
    if (line && (line + " " + word).length > max) {
      result.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) result.push(line);
  return result;
}
export function moneyPrinterOverlay(
  story: Story,
  index: number,
  asset: Asset | undefined,
  preview: boolean,
) {
  const headline = wrap(story.title, 34);
  const credit = asset?.sourceMedia
    ? asset.sourceMedia.credit +
      (asset.sourceMedia.credit === asset.sourceMedia.publisher
        ? ""
        : " · via " + asset.sourceMedia.publisher)
    : asset
      ? asset.creator + " · " + asset.permission
      : "World News · source-linked report";
  const context = asset?.sourceMedia
    ? (asset.mediaType === "video" ? "SOURCE VIDEO EXCERPT" : "SOURCE PHOTO") +
      " · " +
      (asset.sourceMedia.captureDate?.slice(0, 10) ||
        "Published " +
          (asset.sourceMedia.publishedAt?.slice(0, 10) || "date unconfirmed") +
          " · capture date unconfirmed")
    : asset
      ? (asset.subject ? asset.subject + " · " : "") +
        (asset.archive ? "ARCHIVE" : "PHOTO") +
        " · " +
        asset.eventDate
      : "Source-linked narration";
  const label = story.demo
    ? "HISTORICAL DEMO"
    : preview
      ? "PRIVATE PREVIEW · REVIEW PENDING"
      : "EDITORIAL DRAFT";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs><linearGradient id="top" x2="0" y2="1"><stop stop-color="#08130f" stop-opacity=".96"/><stop offset="1" stop-color="#08130f" stop-opacity="0"/></linearGradient><linearGradient id="bottom" x2="0" y2="1"><stop stop-color="#08130f" stop-opacity="0"/><stop offset=".4" stop-color="#08130f" stop-opacity=".94"/></linearGradient></defs><rect width="1080" height="450" fill="url(#top)"/><rect y="1630" width="1080" height="290" fill="url(#bottom)"/><rect x="52" y="55" width="6" height="34" fill="#bed897"/><text x="76" y="82" font-family="sans-serif" fill="#fff" font-size="28" font-weight="700">WORLD NEWS</text><text x="1028" y="81" text-anchor="end" font-family="sans-serif" fill="#d4e5be" font-size="21">${escape(story.category.toUpperCase())} · ${index + 1}/${story.segments.length}</text><text x="52" y="151" font-family="sans-serif" fill="white" font-size="48" font-weight="700">${headline.map((line, i) => `<tspan x="52" dy="${i ? 57 : 0}">${escape(line)}</tspan>`).join("")}</text><text x="52" y="1702" font-family="sans-serif" fill="#deead1" font-size="21">${wrap(
    context,
    85,
  )
    .map(
      (line, i) => `<tspan x="52" dy="${i ? 26 : 0}">${escape(line)}</tspan>`,
    )
    .join(
      "",
    )}</text><text x="52" y="1765" font-family="sans-serif" fill="white" font-size="24">${wrap(
    "Credit: " + credit,
    76,
  )
    .map(
      (line, i) => `<tspan x="52" dy="${i ? 29 : 0}">${escape(line)}</tspan>`,
    )
    .join(
      "",
    )}</text><text x="52" y="1880" font-family="sans-serif" fill="#c7dcb0" font-size="19">${escape(label)} · /s/${escape(story.id.slice(0, 8))}?v=${story.version}</text></svg>`;
}
export async function safeFile(file: string) {
  const resolved = await realpath(path.join(dataDir, file));
  const base = await realpath(dataDir);
  if (!resolved.startsWith(base + path.sep))
    throw new Error("Media path is outside the application data directory.");
  return resolved;
}
export async function bridge(file: string, data: Record<string, unknown>) {
  await writeFile(file, JSON.stringify({ ...data, dataDir }));
  try {
    await exec(
      python,
      [path.join(root, "scripts/media/mpt-render.py"), "--input", file],
      {
        cwd: root,
        timeout: 900000,
        maxBuffer: 2_000_000,
        env: {
          PATH: process.env.PATH,
          TMPDIR: process.env.TMPDIR,
          MPT_HOME: path.join(home, "runtime"),
          WORLDNEWS_MPT_SOURCE: source,
        },
      },
    );
  } catch (error) {
    const detail = error as {
      stderr?: string;
      stdout?: string;
      message?: string;
    };
    // Retain the actionable adapter error; keep provider settings out of dashboard errors.
    throw new Error(
      "MoneyPrinterTurbo render failed: " +
        (
          detail.stderr ||
          detail.stdout ||
          detail.message ||
          "Unknown rendering error"
        ).slice(-1800),
    );
  }
}
export async function renderMoneyPrinterScene(
  story: Story,
  index: number,
  dir: string,
  audio: string,
  duration: number,
  preview: boolean,
  fallback: string,
) {
  const segment = story.segments[index],
    asset = story.assets.find((a) => a.id === segment.assetId);
  const overlay = path.join(dir, `mpt-overlay-${index}.png`);
  await sharp(Buffer.from(moneyPrinterOverlay(story, index, asset, preview)))
    .png()
    .toFile(overlay);
  let material = asset ? await safeFile(asset.file) : fallback;
  const kind = asset?.mediaType === "video" ? "video" : "image";
  if (kind === "image") {
    const bytes = await readFile(material);
    const background = await sharp(bytes)
      .resize(1080, 1920, { fit: "cover", position: sharp.strategy.attention })
      .blur(30)
      .modulate({ brightness: 0.45 })
      .png()
      .toBuffer();
    const foreground = await sharp(bytes)
      .resize(1080, 1450, { fit: "inside" })
      .png()
      .toBuffer();
    const meta = await sharp(foreground).metadata();
    material = path.join(dir, `mpt-photo-${index}.png`);
    await sharp(background)
      .composite([
        {
          input: foreground,
          left: Math.floor((1080 - meta.width!) / 2),
          top: Math.floor((1920 - meta.height!) / 2),
        },
      ])
      .png()
      .toFile(material);
  }
  await bridge(path.join(dir, `mpt-scene-${index}.json`), {
    mode: "scene",
    kind,
    material,
    overlay,
    audio,
    duration,
    output: path.join(dir, `scene-${index}.mp4`),
  });
}
export function cuesToSrt(cues: string[]) {
  return (
    cues
      .map(
        (cue, index) =>
          `${index + 1}\n${cue.replace(/^(\d{2}:\d{2}:\d{2})\.(\d{3}) --> (\d{2}:\d{2}:\d{2})\.(\d{3})/, "$1,$2 --> $3,$4")}`,
      )
      .join("\n\n") + "\n\n"
  );
}
export async function finishMoneyPrinter(
  story: Story,
  dir: string,
  cues: string[],
) {
  const subtitles = path.join(dir, "captions.srt"),
    output = path.join(dir, "mpt-final.mp4"),
    video = path.join(dir, "video.mp4");
  await writeFile(subtitles, cuesToSrt(cues));
  await bridge(path.join(dir, "mpt-captions.json"), {
    mode: "captions",
    title: story.title,
    video,
    subtitles,
    output,
  });
  await rename(output, video);
  await exec(
    "ffmpeg",
    [
      "-y",
      "-ss",
      "1",
      "-i",
      video,
      "-frames:v",
      "1",
      path.join(dir, "story.png"),
    ],
    { timeout: 20000 },
  );
}
