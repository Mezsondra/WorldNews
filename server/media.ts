import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Story, Render, CostEvent } from "../shared/types.js";
import { dataDir, Store } from "./db.js";
import { now } from "./domain.js";
import {
  geminiSpeech,
  assemblyCaptions,
  reserve,
  captionDifferences,
  voiceLabel,
} from "./providers.js";
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
  privatePreview = false,
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
  const publishers = [...new Set(sources.map((s) => s!.publisher))];
  const publisherLabel =
    (publishers[0] || "Sources pending").slice(0, 38) +
    (sources.length > 1 ? ` · ${sources.length} source records` : "");
  const sourceDates = [
    ...new Set(sources.map((s) => s!.publishedAt?.slice(0, 10) || "undated")),
  ];
  const dateLabel =
    "Source dates: " +
    sourceDates.slice(0, 2).join(" · ") +
    (sourceDates.length > 2 ? ` · +${sourceDates.length - 2}` : "");
  const date = story.eventAt
    ? new Date(story.eventAt).toISOString().slice(0, 10)
    : "Date pending";
  const card = height === 1350;
  const asset = story.assets.find((a) => a.id === segment?.assetId);
  const photo = !!background;
  let titleSize = photo ? (card ? 56 : 64) : story.title.length > 105 ? 64 : 78;
  while (
    titleSize > 38 &&
    lines(story.title, Math.floor(920 / (titleSize * 0.55))).length *
      titleSize *
      1.13 >
      (photo ? 220 : 340)
  )
    titleSize -= 2;
  const body = card
    ? (story.summary || segment?.text || "Evidence-led reporting").slice(0, 220)
    : segment?.text || "";
  let bodySize = photo ? 28 : card ? 31 : 40;
  const bodyHeight = photo ? (card ? 130 : 180) : card ? 200 : 550;
  while (
    bodySize > 22 &&
    lines(body, Math.floor(900 / (bodySize * 0.55))).length * bodySize * 1.4 >
      bodyHeight
  )
    bodySize -= 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}">
    <rect width="1080" height="${height}" fill="#152a26"/>
    ${background ? `<image href="data:image/png;base64,${background}" x="80" y="${card ? 440 : 650}" width="920" height="${card ? 390 : 560}" preserveAspectRatio="xMidYMid slice"/>` : ""}
    <path d="M80 170h920" stroke="#657970" stroke-width="2"/>
    ${svgText("WORLD NEWS", 80, 125, 34, 40, "#eff1e6")}${svgText(story.demo ? "ARCHIVE / DEMO" : "EDITORIAL DRAFT", 690, 125, 21, 35, "#b7cf9a")}
    ${svgText(story.category.toUpperCase() + "   /   " + date, 80, 260, 23, 50, "#b7cf9a")}
    ${svgText(story.title, 80, photo ? (card ? 305 : 365) : card ? 390 : 405, titleSize, Math.floor(920 / (titleSize * 0.55)), "#f3f1e8", "serif", 1.13)}
    <path d="M80 ${photo ? (card ? 855 : 1265) : card ? 760 : 850}h95" stroke="#bed897" stroke-width="6"/>
    ${svgText(body, 80, photo ? (card ? 900 : 1320) : card ? 845 : 950, bodySize, Math.floor(900 / (bodySize * 0.55)), "#d9e0d2", "sans-serif", 1.4)}
    ${svgText(publisherLabel, 80, height - 300, 34, 48, "#c8d8b8")}
    ${svgText(dateLabel, 80, height - 245, 30, 53, "#aabbac")}
    ${asset ? svgText((asset.archive ? "ARCHIVE PHOTO · " : "PHOTO · ") + asset.eventDate + " · " + asset.location.slice(0, 40), 80, photo ? (card ? 420 : 625) : height - 390, 21, 85, "#b7c8a6") : ""}
    ${asset ? svgText(asset.creator + " · " + asset.permission, 80, card ? 1020 : 1555, 17, 110, "#b7c8a6") : ""}
    ${svgText((process.env.PUBLIC_BASE_URL || "http://localhost:4310").replace(/^https?:\/\//, "") + "/s/" + story.id.slice(0, 8) + "?v=" + story.version, 80, height - 190, 24, 70, "#e5ebdd")}
    ${svgText(story.demo ? "HISTORICAL SAMPLE · NOT CURRENT NEWS" : privatePreview ? "PRIVATE PREVIEW · EDITORIAL REVIEW PENDING" : "DRAFT · EDITORIAL APPROVAL REQUIRED", 80, height - 115, 22, 70, "#adc594")}
    ${!card ? svgText(String(segmentIndex + 1).padStart(2, "0") + " / " + String(story.segments.length).padStart(2, "0"), 850, height - 115, 22, 15, "#adc594") : ""}
  </svg>`;
}
function pronounce(text: string, story: Story) {
  for (const [from, to] of Object.entries(story.pronunciations))
    text = text.split(from).join(to);
  return text;
}
async function narration(
  text: string,
  file: string,
  story: Story,
  store?: Store,
  event?: CostEvent,
  provider = process.env.TTS_PROVIDER || "local",
) {
  text = pronounce(text, story);
  if (provider === "gemini") {
    const result = await geminiSpeech(text, process.env.GEMINI_VOICE || "Kore");
    await writeFile(file + ".provider-audio", result.audio);
    const isWav = result.audio.subarray(0, 4).toString() === "RIFF";
    if (!isWav && !/pcm|L16/i.test(result.mime))
      throw new Error("Gemini returned an unsupported audio encoding.");
    await exec(
      "ffmpeg",
      [
        "-y",
        ...(!isWav ? ["-f", "s16le", "-ar", "24000", "-ac", "1"] : []),
        "-i",
        file + ".provider-audio",
        "-ar",
        "48000",
        "-ac",
        "1",
        file,
      ],
      { timeout: 60000 },
    );
    if (store && event) {
      event.usage = {
        ...event.usage,
        scenes: Number(event.usage?.scenes || 0) + 1,
        lastUsage: result.usage,
        requests: [
          ...(Array.isArray(event.usage?.requests) ? event.usage.requests : []),
          { providerId: result.providerId, usage: result.usage },
        ],
      };
      event.providerId = result.providerId;
      await store.finishCost(event);
    }
  } else if (provider === "elevenlabs") {
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
  store?: Store,
  options: {
    tts?: "local" | "gemini";
    captions?: "estimated" | "assemblyai";
    privatePreview?: boolean;
  } = {},
): Promise<Render> {
  const provider = options.tts || process.env.TTS_PROVIDER || "local";
  const captions =
    options.captions || process.env.CAPTIONS_PROVIDER || "estimated";
  if (
    options.privatePreview &&
    (provider !== "local" || captions !== "estimated")
  )
    throw new Error(
      "Automatic private previews use local narration and estimated captions only.",
    );
  const paidChars = story.segments.reduce(
    (n, s) => n + pronounce(s.text, story).length,
    0,
  );
  if (
    ["elevenlabs", "gemini"].includes(provider) &&
    paidChars > Number(process.env.MAX_PAID_CHARACTERS_PER_RENDER || 1500)
  )
    throw new Error(
      "Paid narration character ceiling exceeded. Shorten the script or explicitly raise the configured cap.",
    );
  if (!["local", "gemini", "elevenlabs"].includes(provider))
    throw new Error("Unknown narration provider.");
  if (
    provider === "gemini" &&
    (!process.env.GEMINI_API_KEY || story.segments.length > 8)
  )
    throw new Error(
      "Gemini needs its API key and at most eight scenes for the bounded pilot.",
    );
  if (provider === "elevenlabs")
    throw new Error(
      "ElevenLabs is outside this capped pilot. Select local or Gemini narration.",
    );
  if (captions === "assemblyai" && !process.env.ASSEMBLYAI_API_KEY)
    throw new Error("AssemblyAI captions need ASSEMBLYAI_API_KEY.");
  if ((provider === "gemini" || captions === "assemblyai") && !store)
    throw new Error("Paid media requires the persistent pilot ledger.");
  const voiceEvent =
    provider === "gemini"
      ? await reserve(store!, story, "gemini", "narration", 1)
      : undefined;
  let captionEvent: CostEvent | undefined;
  try {
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
          options.privatePreview,
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
      const duration = await narration(
        segment.text,
        wav,
        story,
        store,
        voiceEvent,
        provider,
      );
      if (!Number.isFinite(duration) || duration <= 0 || duration > 90)
        throw new Error(
          "Scene audio duration is invalid; no automatic retry was made.",
        );
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
      const clip = await exec("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        path.join(dir, `scene-${i}.mp4`),
      ]);
      const clipDuration = Number(clip.stdout.trim());
      if (!Number.isFinite(clipDuration) || clipDuration <= 0)
        throw new Error("Rendered scene duration is invalid.");
      scenes.push({
        segmentId: segment.id,
        text: segment.text,
        claimIds: segment.claimIds,
        sourceIds,
        assetId: segment.assetId || null,
        start: offset,
        end: offset + clipDuration,
        narrationDuration: duration,
      });
      offset += clipDuration;
    }
    const minDuration = story.format === "brief" ? 20 : 60;
    if (offset < minDuration || offset > 90)
      throw new Error(
        `Narration is ${offset.toFixed(1)} seconds. Adjust script or pronunciations to reach ${minDuration}–90 seconds, then render again.`,
      );
    if (voiceEvent) {
      voiceEvent.state = "succeeded";
      await store!.finishCost(voiceEvent);
    }
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
    const finalProbe = await exec("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      path.join(dir, "video.mp4"),
    ]);
    const finalDuration = Number(finalProbe.stdout.trim());
    if (
      !Number.isFinite(finalDuration) ||
      finalDuration < minDuration ||
      finalDuration > 90
    )
      throw new Error(
        `Final video duration falls outside ${minDuration}–90 seconds.`,
      );
    offset = finalDuration;
    let captionTiming =
      "Estimated word groups within measured scene audio; review against playback.";
    let captionWarnings: string[] = [];
    if (captions === "assemblyai") {
      await progress("Aligning captions with AssemblyAI word timestamps");
      captionEvent = await reserve(
        store!,
        story,
        "assemblyai",
        "captions",
        0.1,
      );
      const audioFile = path.join(dir, "caption-audio.wav");
      await exec(
        "ffmpeg",
        [
          "-y",
          "-i",
          path.join(dir, "video.mp4"),
          "-vn",
          "-ar",
          "16000",
          "-ac",
          "1",
          audioFile,
        ],
        { timeout: 60000 },
      );
      const transcript = await assemblyCaptions(
        store!,
        captionEvent,
        await readFile(audioFile),
      );
      if (
        transcript.words.some(
          (w, i) =>
            w.end < w.start ||
            w.end > Math.ceil(offset * 1000) + 2000 ||
            (i > 0 && w.start < transcript.words[i - 1].start),
        )
      )
        throw new Error("AssemblyAI returned invalid word timings.");
      cues.length = 0;
      for (let i = 0; i < transcript.words.length; i += 8) {
        const group = transcript.words.slice(i, i + 8);
        cues.push(
          `${timestamp(group[0].start / 1000)} --> ${timestamp(group.at(-1)!.end / 1000)}\n${group.map((w) => w.text).join(" ")}`,
        );
      }
      captionTiming =
        "AssemblyAI word timestamps; transcript compared with the script and requires editorial review.";
      captionWarnings = captionDifferences(
        story.segments.map((s) => s.text).join(" "),
        transcript.words,
      );
      await writeFile(
        path.join(dir, "transcript.json"),
        JSON.stringify({ ...transcript, captionWarnings }, null, 2),
      );
    }
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
      voice: voiceLabel(provider),
      format: story.format || "explainer",
      privatePreview: !!options.privatePreview,
      warnings: options.privatePreview ? story.automation?.warnings || [] : [],
      captionTiming,
      captionWarnings,
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
      privatePreview: manifest.privatePreview,
      warnings: manifest.warnings,
      captionTiming,
      captionWarnings,
    };
  } catch (error) {
    for (const event of [voiceEvent, captionEvent])
      if (event && event.state === "reserved") {
        event.state = "uncertain";
        event.note =
          "Render interrupted. Reservation retained; inspect outputs and provider usage before another revision.";
        await store!.finishCost(event);
      }
    throw error;
  }
}
