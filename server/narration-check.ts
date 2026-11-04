import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Story } from "../shared/types.js";
import { dataDir } from "./db.js";
import { narration, exec } from "./media.js";
import { narrationKey, cachedBytes, cacheBytes } from "./render-cache.js";

// Local speech checks share the renderer's cache. They never reserve API usage
// or alter playback speed; a later paid voice is measured again at render time.
export async function measureLocalNarration(story: Story) {
  const dir = path.join(
    dataDir,
    "narration-checks",
    story.id,
    `v${story.version}`,
  );
  await mkdir(dir, { recursive: true });
  let total = 0;
  for (const segment of story.segments) {
    const key = narrationKey(story, segment.text, "local");
    const file = path.join(dir, `${key}.wav`);
    const cached = await cachedBytes("narration", key, "wav");
    if (cached) await writeFile(file, cached);
    else {
      await narration(segment.text, file, story, undefined, undefined, "local");
      await cacheBytes("narration", key, "wav", await readFile(file));
    }
    const duration = Number(
      (
        await exec(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            file,
          ],
          { timeout: 30000 },
        )
      ).stdout.trim(),
    );
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error(
        "The local narration check returned invalid audio. No provider request was retried.",
      );
    total += duration;
  }
  return total;
}
