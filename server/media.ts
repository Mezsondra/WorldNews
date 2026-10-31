import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Story, Render } from "../shared/types.js";
import { dataDir } from "./db.js";
import { now } from "./domain.js";
export const exec = promisify(execFile);
export const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function lines(text: string, max: number) {
  const result: string[] = [];
  let line = "";
  const measure = (s: string) =>
    [...s].reduce(
      (sum, c) =>
        sum +
        (/[WM@#%]/.test(c)
          ? 0.95
          : /[ilI.,'!:;]/.test(c)
            ? 0.28
            : /\s/.test(c)
              ? 0.28
              : /[A-Z]/.test(c)
                ? 0.7
                : 0.56),
      0,
    );
  const limit = max * 0.55;
  const words: string[] = [];
  for (const word of text.split(/\s+/)) {
    let part = "";
    for (const c of word) {
      if (part && measure(part + c) > limit) {
        words.push(part);
        part = c;
      } else part += c;
    }
    if (part) words.push(part);
  }
  for (const word of words) {
    if (measure((line + " " + word).trim()) > limit && line) {
      result.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) result.push(line);
  return result;
}
function svgText(
  text: string,
  x: number,
  y: number,
  size: number,
  width: number,
  color = "#f3f1e8",
  family = "sans-serif",
  lineHeight = 1.25,
) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="${family}" font-size="${size}">${lines(
    text,
    width,
  )
    .map(
      (line, i) =>
        `<tspan x="${x}" dy="${i ? size * lineHeight : 0}">${escape(line)}</tspan>`,
    )
    .join("")}</text>`;
}
export function frame(
  story: Story,
  segmentIndex: number,
  height = 1920,
  background?: string,
) {
  const segment = story.segments[segmentIndex];
  const sourceIds = [
    ...new Set(
      segment?.claimIds.flatMap(
        (cid) =>
          story.claims
            .find((c) => c.id === cid)
            ?.evidence.map((e) => e.sourceId) || [],
      ) || [],
    ),
  ];
  const sources = sourceIds
    .map((sid) => story.sources.find((s) => s.id === sid))
    .filter(Boolean);
  const date = story.eventAt
    ? new Date(story.eventAt).toISOString().slice(0, 10)
    : "Date pending";
  const card = height === 1350;
  const asset = story.assets.find((a) => a.id === segment?.assetId);
  let titleSize = story.title.length > 105 ? 64 : 78;
  while (
    titleSize > 38 &&
    lines(story.title, Math.floor(920 / (titleSize * 0.55))).length *
      titleSize *
      1.13 >
      340
  )
    titleSize -= 2;
  const body = card
    ? (story.summary || segment?.text || "Evidence-led reporting").slice(0, 220)
    : segment?.text || "";
  let bodySize = card ? 31 : 40;
  const bodyHeight = card ? 200 : 550;
  while (
    bodySize > 22 &&
    lines(body, Math.floor(900 / (bodySize * 0.55))).length * bodySize * 1.4 >
      bodyHeight
  )
    bodySize -= 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}">
    <rect width="1080" height="${height}" fill="#152a26"/>
    ${background ? `<image href="data:image/png;base64,${background}" x="0" y="280" width="1080" height="${height - 280}" preserveAspectRatio="xMidYMid slice"/><rect y="280" width="1080" height="${height - 280}" fill="#10231f" opacity=".86"/>` : ""}
    <path d="M80 170h920" stroke="#657970" stroke-width="2"/>
    ${svgText("WORLD NEWS", 80, 125, 34, 40, "#eff1e6")}${svgText(story.demo ? "ARCHIVE / DEMO" : "EDITORIAL DRAFT", 690, 125, 21, 35, "#b7cf9a")}
    ${svgText(story.category.toUpperCase() + "   /   " + date, 80, 260, 23, 50, "#b7cf9a")}
    ${svgText(story.title, 80, card ? 390 : 405, titleSize, Math.floor(920 / (titleSize * 0.55)), "#f3f1e8", "serif", 1.13)}
    <path d="M80 ${card ? 760 : 850}h95" stroke="#bed897" stroke-width="6"/>
    ${svgText(body, 80, card ? 845 : 950, bodySize, Math.floor(900 / (bodySize * 0.55)), "#d9e0d2", "sans-serif", 1.4)}
    ${svgText(sources.map((s) => s!.publisher).join(" · ") || "Sources pending", 80, height - 280, 25, 55, "#c8d8b8")}
    ${svgText(sources.map((s) => s!.publishedAt?.slice(0, 10) || "Date not provided").join(" · "), 80, height - 235, 22, 60, "#aabbac")}
    ${asset ? svgText((asset.archive ? "ARCHIVE · " : "") + asset.creator + " · " + asset.eventDate + " · " + asset.location, 80, height - 325, 18, 75, "#b7c8a6") : ""}
    ${svgText((process.env.PUBLIC_BASE_URL || "http://localhost:4310").replace(/^https?:\/\//, "") + "/s/" + story.id.slice(0, 8) + "?v=" + story.version, 80, height - 175, 22, 70, "#e5ebdd")}
    ${svgText(story.demo ? "HISTORICAL SAMPLE · NOT CURRENT NEWS" : "DRAFT · EDITORIAL APPROVAL REQUIRED", 80, height - 115, 19, 75, "#adc594")}
    ${!card ? svgText(String(segmentIndex + 1).padStart(2, "0") + " / " + String(story.segments.length).padStart(2, "0"), 850, height - 115, 22, 15, "#adc594") : ""}
  </svg>`;
}
function pronounce(text: string, story: Story) {
  for (const [from, to] of Object.entries(story.pronunciations))
    text = text.split(from).join(to);
  return text;
}
async function narration(text: string, file: string, story: Story) {
  text = pronounce(text, story);
  if (process.env.TTS_PROVIDER === "elevenlabs") {
    const key = process.env.ELEVENLABS_API_KEY,
      voice = process.env.ELEVENLABS_VOICE_ID;
    if (!key || !voice || !/^[a-zA-Z0-9_-]+$/.test(voice))
      throw new Error("Configure an ElevenLabs key and licensed voice ID.");
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.6, similarity_boost: 0.75 },
        }),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!response.ok)
      throw new Error(
        `Narration provider returned HTTP ${response.status}; job was not retried.`,
      );
    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length > 20_000_000)
      throw new Error("Narration response is too large.");
    await writeFile(file + ".mp3", audio);
    await exec(
      "ffmpeg",
      ["-y", "-i", file + ".mp3", "-ar", "48000", "-ac", "1", file],
      { timeout: 60000 },
    );
  } else if (process.platform === "darwin") {
    await exec("say", ["-r", "155", "-o", file + ".aiff", "--", text], {
      timeout: 60000,
    });
    await exec(
      "ffmpeg",
      ["-y", "-i", file + ".aiff", "-ar", "48000", "-ac", "1", file],
      { timeout: 60000 },
    );
  } else
    await exec("espeak-ng", ["-s", "155", "-w", file, "--", text], {
      timeout: 60000,
    });
  const { stdout } = await exec("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    file,
  ]);
  return Number(stdout.trim());
}
const timestamp = (n: number) => {
  const ms = Math.round(n * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
};
export async function renderStory(
  story: Story,
  progress: (value: string) => Promise<void>,
): Promise<Render> {
  const paidChars = story.segments.reduce(
    (n, s) => n + pronounce(s.text, story).length,
    0,
  );
  if (
    process.env.TTS_PROVIDER === "elevenlabs" &&
    paidChars > Number(process.env.MAX_PAID_CHARACTERS_PER_RENDER || 1500)
  )
    throw new Error(
      "Paid narration character ceiling exceeded. Shorten the script or explicitly raise the configured cap.",
    );
  const relative = `renders/${story.id}/v${story.version}`,
    dir = path.join(dataDir, relative);
  await mkdir(dir, { recursive: true });
  const image = async (i: number, h: number) => {
    const a = story.assets.find((a) => a.id === story.segments[i]?.assetId);
    return Buffer.from(
      frame(
        story,
        i,
        h,
        a
          ? (await readFile(path.join(dataDir, a.file))).toString("base64")
          : undefined,
      ),
    );
  };
  await sharp(await image(0, 1350))
    .png()
    .toFile(path.join(dir, "card.png"));
  await sharp(await image(0, 1920))
    .png()
    .toFile(path.join(dir, "story.png"));
  const scenes: any[] = [];
  let offset = 0;
  const cues: string[] = [];
  for (let i = 0; i < story.segments.length; i++) {
    await progress(
      `Narrating and rendering scene ${i + 1} of ${story.segments.length}`,
    );
    const segment = story.segments[i];
    const wav = path.join(dir, `scene-${i}.wav`),
      png = path.join(dir, `scene-${i}.png`);
    const duration = await narration(segment.text, wav, story);
    await sharp(await image(i, 1920))
      .png()
      .toFile(png);
    await exec(
      "ffmpeg",
      [
        "-y",
        "-loop",
        "1",
        "-framerate",
        "12",
        "-i",
        png,
        "-i",
        wav,
        "-t",
        duration.toFixed(3),
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
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-ac",
        "1",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        path.join(dir, `scene-${i}.mp4`),
      ],
      { timeout: 180000, maxBuffer: 2_000_000 },
    );
    const sourceIds = [
      ...new Set(
        segment.claimIds.flatMap((cid) =>
          story.claims
            .find((c) => c.id === cid)!
            .evidence.map((e) => e.sourceId),
        ),
      ),
    ];
    const words = segment.text.split(/\s+/);
    for (let j = 0; j < words.length; j += 8) {
      const end = Math.min(j + 8, words.length);
      cues.push(
        `${timestamp(offset + (duration * j) / words.length)} --> ${timestamp(offset + (duration * end) / words.length)}\n${words.slice(j, end).join(" ")}`,
      );
    }
    scenes.push({
      segmentId: segment.id,
      text: segment.text,
      claimIds: segment.claimIds,
      sourceIds,
      assetId: segment.assetId || null,
      start: offset,
      end: offset + duration,
    });
    offset += duration;
  }
  if (offset < 60 || offset > 90)
    throw new Error(
      `Narration is ${offset.toFixed(1)} seconds. Adjust script or pronunciations to reach 60–90 seconds, then render again.`,
    );
  await progress("Assembling video, captions and citation manifest");
  await writeFile(
    path.join(dir, "concat.txt"),
    scenes.map((_, i) => `file 'scene-${i}.mp4'`).join("\n"),
  );
  await exec(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      path.join(dir, "concat.txt"),
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      path.join(dir, "video.mp4"),
    ],
    { timeout: 60000, maxBuffer: 2_000_000 },
  );
  await writeFile(
    path.join(dir, "captions.vtt"),
    "WEBVTT\n\n" + cues.join("\n\n") + "\n",
  );
  const manifest = {
    storyId: story.id,
    version: story.version,
    title: story.title,
    eventAt: story.eventAt,
    createdAt: now(),
    duration: offset,
    voice:
      process.env.TTS_PROVIDER === "elevenlabs"
        ? "ElevenLabs (synthetic)"
        : "Local development voice (synthetic)",
    captionTiming:
      "Estimated word groups within measured scene audio; review against playback.",
    sourcePage: `${process.env.PUBLIC_BASE_URL || "http://localhost:4310"}/s/${story.id.slice(0, 8)}?v=${story.version}`,
    scenes,
    sources: story.sources.map(({ text, ...s }) => s),
    claims: story.claims,
    assets: story.assets,
  };
  await writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  return {
    version: story.version,
    card: `${relative}/card.png`,
    story: `${relative}/story.png`,
    video: `${relative}/video.mp4`,
    captions: `${relative}/captions.vtt`,
    manifest: `${relative}/manifest.json`,
    duration: offset,
    createdAt: now(),
    voice: manifest.voice,
  };
}
