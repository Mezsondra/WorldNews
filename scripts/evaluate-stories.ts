import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { evaluateStories, evaluationMarkdown } from "../server/evaluation.js";
const option = (name: string, fallback = "") => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
};
const input = option("--input");
let overview;
if (input) overview = JSON.parse(await readFile(path.resolve(input), "utf8"));
else {
  const base = new URL(option("--base-url", "http://127.0.0.1:4310"));
  if (
    !["http:", "https:"].includes(base.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
    base.username ||
    base.password
  )
    throw new Error(
      "Use a local dashboard address or a saved --input snapshot.",
    );
  const response = await fetch(new URL("/api/overview", base), {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `The read-only dashboard request failed: ${response.status}`,
    );
  overview = await response.json();
}
if (!Array.isArray(overview.stories))
  throw new Error("The snapshot must contain a stories array.");
const report = evaluateStories(overview.stories);
const output = path.resolve(option("--out", "data/evaluations/latest"));
await mkdir(output, { recursive: true });
await writeFile(
  path.join(output, "evaluation.json"),
  JSON.stringify(report, null, 2),
);
await writeFile(path.join(output, "evaluation.md"), evaluationMarkdown(report));
console.log(
  `${report.stories.filter((s) => s.previewEligible).length}/${report.stories.length} dossiers pass saved-evidence private-preview gates. No provider call, story mutation or publication was performed.\n${path.join(output, "evaluation.md")}`,
);
