import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import type { Story, Render, CostEvent } from "../shared/types.js";
import { Store } from "./db.js";
import { ensureMoneyPrinter } from "./moneyprinterturbo.js";
import { assertNarrationScript, sourcePageUrl } from "./production-record.js";
import { geminiSpeech, voiceLabel } from "./providers.js";
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
    ${background ? `<image href="data:image/png;base64,${background}" x="80" y="${card ? 440 : 650}" width="920" height="${card ? 390 : 560}" preserveAspectRatio="xMidYMid ${asset?.sourceMedia ? "meet" : "slice"}"/>` : ""}
    <path d="M80 170h920" stroke="#657970" stroke-width="2"/>
    ${svgText("WORLD NEWS", 80, 125, 34, 40, "#eff1e6")}${svgText(story.demo ? "ARCHIVE / DEMO" : "EDITORIAL DRAFT", 690, 125, 21, 35, "#b7cf9a")}
    ${svgText(story.category.toUpperCase() + "   /   " + date, 80, 260, 23, 50, "#b7cf9a")}
    ${svgText(story.title, 80, photo ? (card ? 305 : 365) : card ? 390 : 405, titleSize, Math.floor(920 / (titleSize * 0.55)), "#f3f1e8", "serif", 1.13)}
    <path d="M80 ${photo ? (card ? 855 : 1265) : card ? 760 : 850}h95" stroke="#bed897" stroke-width="6"/>
    ${svgText(body, 80, photo ? (card ? 900 : 1320) : card ? 845 : 950, bodySize, Math.floor(900 / (bodySize * 0.55)), "#d9e0d2", "sans-serif", 1.4)}
    ${svgText(publisherLabel, 80, height - 300, 34, 48, "#c8d8b8")}
    ${svgText(dateLabel, 80, height - 245, 30, 53, "#aabbac")}
    ${asset ? svgText(asset.sourceMedia ? (asset.mediaType === "video" ? "SOURCE VIDEO EXCERPT" : "SOURCE PHOTO") + " · " + (asset.sourceMedia.captureDate ? "Dated " + asset.sourceMedia.captureDate.slice(0, 10) : "Published " + (asset.sourceMedia.publishedAt?.slice(0, 10) || "date unconfirmed") + " · capture date unconfirmed") : (asset.subject ? asset.subject + " · ARCHIVE PORTRAIT · " : asset.archive ? "ARCHIVE PHOTO · " : "PHOTO · ") + asset.eventDate + " · " + asset.location.slice(0, 40), 80, photo ? (card ? 420 : 625) : height - 390, 21, 85, "#b7c8a6") : ""}
    ${asset ? svgText(asset.sourceMedia ? "Credit: " + asset.sourceMedia.credit + " · via " + asset.sourceMedia.publisher : asset.creator + " · " + asset.permission, 80, card ? 1020 : 1555, 20, 105, "#c8d8b8") : ""}
    ${svgText(sourcePageUrl(story).replace(/^https?:\/\//, ""), 80, height - 190, 24, 70, "#e5ebdd")}
    ${svgText(story.demo ? "HISTORICAL SAMPLE · NOT CURRENT NEWS" : privatePreview ? "PRIVATE PREVIEW · EDITORIAL REVIEW PENDING" : "DRAFT · EDITORIAL APPROVAL REQUIRED", 80, height - 115, 22, 70, "#adc594")}
    ${!card ? svgText(String(segmentIndex + 1).padStart(2, "0") + " / " + String(story.segments.length).padStart(2, "0"), 850, height - 115, 22, 15, "#adc594") : ""}
  </svg>`;
}
function pronounce(text: string, story: Story) {
  for (const [from, to] of Object.entries(story.pronunciations).sort(
    ([a], [b]) => a.localeCompare(b),
  ))
    text = text.split(from).join(to);
  return text;
}
export function narrationCharacters(story: Story) {
  return story.segments.reduce(
    (n, s) => n + pronounce(s.text, story).length,
    0,
  );
}
export async function narration(
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
  assertNarrationScript(story);
  const provider =
    options.tts ||
    story.narrationProvider ||
    process.env.TTS_PROVIDER ||
    "local";
  const renderer = story.videoRenderer || "classic";
  if (renderer === "moneyprinterturbo") await ensureMoneyPrinter();
  const captions =
    options.captions ||
    story.captionProvider ||
    process.env.CAPTIONS_PROVIDER ||
    "estimated";
  if (
    options.privatePreview &&
    ((captions !== "estimated" && options.captions !== "assemblyai") ||
      (provider !== "local" && options.tts !== "gemini"))
  )
    throw new Error(
      "Private previews require an explicit Gemini selection for paid narration and explicit AssemblyAI selection for aligned captions.",
    );
  const paidChars = narrationCharacters(story);
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
  const { renderEditorialVideo } = await import("./editorial-video.js");
  return renderEditorialVideo(story, progress, store, {
    provider,
    captions,
    privatePreview: !!options.privatePreview,
    renderer,
  });
}

export function sameNarration(a: Story, b: Story) {
  const pronunciations = (s: Story) =>
    JSON.stringify(
      Object.entries(s.pronunciations).sort(([a], [b]) => a.localeCompare(b)),
    );
  return (
    JSON.stringify(a.segments.map((s) => s.text)) ===
      JSON.stringify(b.segments.map((s) => s.text)) &&
    pronunciations(a) === pronunciations(b)
  );
}
