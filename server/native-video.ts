import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { cuesToSrt } from "./moneyprinterturbo.js";
import { CAPTION_STYLE } from "../shared/visuals.js";
const exec = promisify(execFile);
export const NATIVE_VIDEO_VERSION = "ffmpeg-evidence-visuals-v2";

export function captionAss(cues: string[]) {
  const time = (s: string) =>
    s.replace(/^0/, "").replace(/\.(\d{2})\d$/, ".$1");
  // Literal source text must not become ASS styling instructions. Fullwidth
  // brace/backslash glyphs preserve readability without executable overrides.
  const literal = (s: string) =>
    s
      .replace(/\\/g, "＼")
      .replace(/{/g, "｛")
      .replace(/}/g, "｝")
      .replace(/\r/g, "")
      .replace(/\n/g, "\\N");
  return (
    `[Script Info]\nScriptType: v4.00+\nPlayResX: ${CAPTION_STYLE.width}\nPlayResY: ${CAPTION_STYLE.height}\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${CAPTION_STYLE.font},${CAPTION_STYLE.size},&H00FFFFFF,&H00FFFFFF,&H001C2010,&H80000000,-1,0,0,0,100,100,0,0,1,${CAPTION_STYLE.outline},0,2,72,72,${CAPTION_STYLE.marginBottom},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` +
    cues
      .map((cue) => {
        const [span, ...rows] = cue.split("\n");
        const [start, end] = span.split(" --> ");
        return `Dialogue: 0,${time(start)},${time(end)},Default,,0,0,0,,${literal(rows.join("\n"))}`;
      })
      .join("\n") +
    "\n"
  );
}

export async function renderNativeShot(input: {
  material: string;
  overlay: string;
  headline?: string;
  duration: number;
  videoStart?: number;
  video: boolean;
  output: string;
}) {
  const frames = Math.round(input.duration * 24);
  if (frames < 72 || frames > 240)
    throw new Error(
      "Visual shots require 3–10 seconds, including reading time.",
    );
  const filters = input.video
    ? "[0:v]split[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:2[base];[fg]scale=1008:1050:force_original_aspect_ratio=decrease[front];[base][front]overlay=(W-w)/2:330+(1050-h)/2,setsar=1[picture]"
    : "[0:v]setsar=1[picture]";
  await exec(
    "ffmpeg",
    [
      "-y",
      ...(input.video
        ? ["-ss", String(input.videoStart || 0)]
        : ["-loop", "1", "-framerate", "24"]),
      "-i",
      input.material,
      "-loop",
      "1",
      "-framerate",
      "24",
      "-i",
      input.overlay,
      ...(input.headline
        ? ["-loop", "1", "-framerate", "24", "-i", input.headline]
        : []),
      "-filter_complex_threads",
      "1",
      "-filter_complex",
      filters +
        ";[picture][1:v]overlay=0:0" +
        (input.headline
          ? "[marked];[marked][2:v]overlay=0:0:enable='lt(t,3)'[out]"
          : "[out]"),
      "-map",
      "[out]",
      "-an",
      "-t",
      String(frames / 24),
      "-r",
      "24",
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
      "-movflags",
      "+faststart",
      input.output,
    ],
    { timeout: 180000, maxBuffer: 2_000_000 },
  );
}

export async function finishNativeVideo(dir: string, cues: string[]) {
  await writeFile(path.join(dir, "captions.srt"), cuesToSrt(cues));
  await writeFile(path.join(dir, "captions.ass"), captionAss(cues));
  // A fixed relative subtitle filename avoids interpolating source text or paths
  // into FFmpeg's filter syntax. All caption text stays in the subtitle file.
  await exec(
    "ffmpeg",
    [
      "-y",
      "-i",
      "video.mp4",
      "-vf",
      "ass=filename=captions.ass",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "23",
      "-threads",
      "2",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      "native-final.mp4",
    ],
    { cwd: dir, timeout: 240000, maxBuffer: 2_000_000 },
  );
  await rename(path.join(dir, "native-final.mp4"), path.join(dir, "video.mp4"));
  await exec(
    "ffmpeg",
    [
      "-y",
      "-ss",
      "1",
      "-i",
      path.join(dir, "video.mp4"),
      "-frames:v",
      "1",
      path.join(dir, "story.png"),
    ],
    { timeout: 20000, maxBuffer: 1_000_000 },
  );
}
