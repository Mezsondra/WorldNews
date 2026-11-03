import type { VisualEvidence, VisualDraft } from "../shared/visuals.js";
import { wrapVisualText } from "../shared/text-layout.js";

const clean = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
const contains = (a: string, b: string) =>
  clean(a).toLowerCase().includes(clean(b).toLowerCase());
const wholeNumber = (s: string) => Number(s.replace(/,/g, ""));
const count = "(?:0|[1-9]\\d{0,8}|[1-9]\\d{0,2}(?:,\\d{3}){1,2})";
const unit =
  "(?:sites|votes|cases|tests|schools|hospitals|homes|vehicles|flights|samples)";
const risky =
  /\b(?:not|never|no longer|if|hypothetical|may|might|could|would|will|plans?|planned|projected|forecast|expected|target|about|roughly|approximately|nearly|up to|at least|at most|more than|less than|fewer than|between)\b|[<>~±]/i;

/** Conservative literal grammars, not a general data/causality extractor. */
export function extraClauseVisuals(
  segmentId: string,
  narration: string,
  evidence: VisualEvidence[],
): VisualDraft[] {
  const results: VisualDraft[] = [];
  for (const ref of evidence) {
    const saved = ref.translation || ref.passage;
    const source = clean(saved);
    const spoken = clean(narration);
    // Only an explicit same-metric temporal comparison. Do not compare two
    // unrelated monetary amounts, denominators, percentages or counts.
    const series = new RegExp(
      `\\b(?:number of )?(${unit}) (?:rose|fell|changed|increased|decreased) from (${count}) in ((?:18|19|20|21)\\d{2}) to (${count}) in ((?:18|19|20|21)\\d{2})\\b`,
      "i",
    );
    const matches = [...source.matchAll(new RegExp(series.source, "gi"))];
    if (!risky.test(spoken) && !risky.test(source) && matches.length === 1) {
      const m = matches[0];
      const direction = /\b(rose|fell|changed|increased|decreased)\b/i
        .exec(m[0])![1]
        .toLowerCase();
      const from = wholeNumber(m[2]),
        to = wholeNumber(m[4]);
      const consistent =
        direction === "changed" ||
        (["rose", "increased"].includes(direction) ? to > from : to < from);
      if (
        consistent &&
        Number(m[3]) < Number(m[5]) &&
        Number(m[5]) <= new Date().getUTCFullYear() &&
        contains(spoken, m[0]) &&
        from >= 0 &&
        to >= 0 &&
        Math.max(from, to) > 0
      ) {
        results.push({
          kind: "chart",
          segmentId,
          narration,
          purpose:
            "Compare an explicit same-unit series reported in the linked passage, using a zero baseline and the original counts.",
          evidence: [ref],
          unit: m[1],
          context: m[0],
          items: [
            { label: m[3], value: wholeNumber(m[2]), displayedValue: m[2] },
            { label: m[5], value: wholeNumber(m[4]), displayedValue: m[4] },
          ],
        });
      }
    }
    // A speaker must be present in the source's own quote attribution and in
    // narration. An article byline or publisher is never guessed as the speaker.
    const quoted = [...source.matchAll(/"([^"\n]{12,240})"/g)];
    for (const q of quoted) {
      const before = source
        .slice(0, q.index)
        .match(
          /(?:^|[.!?]\s+)([\p{L}][\p{L}\p{N} .’'-]{1,78}?) (?:said|says|stated|wrote):?\s*$/u,
        );
      const after = source
        .slice(q.index! + q[0].length)
        .match(
          /^,?\s*(?:said|says|stated|wrote) ([\p{L}][\p{L}\p{N} ’'-]{1,78})[.!?](?:\s|$)/u,
        );
      const speaker = (before?.[1] || after?.[1])?.trim();
      if (
        !speaker ||
        wrapVisualText(`“${q[1]}”`, 27).length > 8 ||
        !contains(spoken, q[0]) ||
        !contains(spoken, speaker)
      )
        continue;
      results.push({
        kind: "quote",
        segmentId,
        narration,
        purpose:
          "Show an exact quotation with its explicit source-named speaker; this is reported text, not recorded speech.",
        evidence: [ref],
        quote: q[1],
        speaker,
        context: source,
        translated: !!ref.translation,
      });
    }
  }
  return results;
}

export function processVisuals(
  segmentId: string,
  narration: string,
  evidence: VisualEvidence[],
): VisualDraft[] {
  const results: VisualDraft[] = [];
  for (const ref of evidence) {
    const source = ref.translation || ref.passage;
    // Preserve complete step wording and explicit order markers. Ordinary prose,
    // chronology or sentence order alone must not turn into a process diagram.
    const match = clean(source).match(
      /\b(First, [^.!?]{8,150}[.!?])\s+((?:Next|Then), [^.!?]{8,150}[.!?])\s+(Finally, [^.!?]{8,150}[.!?])/,
    );
    if (!match || !match.slice(1).every((step) => contains(narration, step)))
      continue;
    const steps = match.slice(1);
    if (steps.some((step) => wrapVisualText(step, 35).length > 4)) continue;
    results.push({
      kind: "process",
      segmentId,
      narration,
      purpose:
        "Show only the sequence explicitly described by the source and repeated in narration; the numbering preserves that order, not an inferred causal claim.",
      evidence: [ref],
      steps,
      translated: !!ref.translation,
    });
  }
  return results;
}
