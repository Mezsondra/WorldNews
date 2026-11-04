import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { Story } from "../shared/types.js";
import { dataDir } from "./db.js";
import { GEMINI_MODEL } from "./pricing.js";
import { GEMINI_NARRATION_STYLE } from "./providers.js";

export const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export function narrationKey(story: Story, text: string, provider: string) {
  return digest(
    JSON.stringify({
      schema: 1,
      text,
      pronunciations: Object.entries(story.pronunciations).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
      provider,
      voice:
        provider === "gemini"
          ? process.env.GEMINI_VOICE || "Kore"
          : process.platform,
      model: provider === "gemini" ? GEMINI_MODEL : "say155-espeak145",
      style: provider === "gemini" ? GEMINI_NARRATION_STYLE : "local",
    }),
  );
}
export const cachePath = (kind: string, key: string, extension: string) => {
  if (
    !/^[a-z-]+$/.test(kind) ||
    !/^[a-f0-9]{64}$/.test(key) ||
    !/^[a-z0-9]+$/.test(extension)
  )
    throw new Error("Invalid render cache identifier.");
  return path.join(dataDir, "render-cache", kind, `${key}.${extension}`);
};
export async function cachedBytes(
  kind: string,
  key: string,
  extension: string,
) {
  try {
    const file = cachePath(kind, key, extension),
      bytes = await readFile(file),
      metadata = JSON.parse(await readFile(file + ".json", "utf8"));
    return metadata.hash === digest(bytes) ? bytes : undefined;
  } catch {
    return undefined;
  }
}
export async function cacheBytes(
  kind: string,
  key: string,
  extension: string,
  bytes: Buffer,
) {
  const file = cachePath(kind, key, extension);
  await mkdir(path.dirname(file), { recursive: true });
  const temp = file + "." + crypto.randomUUID() + ".tmp";
  await writeFile(temp, bytes);
  await rename(temp, file);
  const metaTemp = temp + ".json";
  await writeFile(
    metaTemp,
    JSON.stringify({
      hash: digest(bytes),
      createdAt: new Date().toISOString(),
    }),
  );
  await rename(metaTemp, file + ".json");
}
