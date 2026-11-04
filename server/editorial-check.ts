import { createHash } from "node:crypto";
import { CONSTRUCTION_POLICY } from "../shared/construction.js";
import type { Story } from "../shared/types.js";

export interface EditorialAssertion {
  id: string;
  text: string;
  claimIds: string[];
}
const clean = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
const digest = (s: string) => createHash("sha256").update(s).digest("hex");

export function editorialAssertions(story: Story): EditorialAssertion[] {
  const p = story.editorial;
  if (!p) return [];
  return [
    { id: "headline", text: story.title, claimIds: p.headline.claimIds },
    { id: "summary", text: story.summary, claimIds: p.summary.claimIds },
    { id: "publishing", ...p.publishing },
    ...p.onScreen.map((a) => ({ ...a, id: `screen:${a.id}` })),
    ...story.segments.map((s) => ({
      id: `segment:${s.id}`,
      text: s.text,
      claimIds: s.claimIds,
    })),
  ];
}

export function assertionEvidence(story: Story, assertion: EditorialAssertion) {
  return story.claims
    .filter((c) => assertion.claimIds.includes(c.id))
    .flatMap((c) => c.evidence.filter((e) => e.relation === "supports"));
}

// Normalize common spoken quantities before comparing them with evidence. The
// semantic check still has to assess units, attribution, causality and meaning.
export function quantities(text: string): string[] {
  const small: Record<string, number> = Object.fromEntries(
    [
      "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen"
        .split(" ")
        .map((w, i) => [w, i]),
      "twenty thirty forty fifty sixty seventy eighty ninety"
        .split(" ")
        .map((w, i) => [w, (i + 2) * 10]),
    ].flat(),
  );
  const numberWords = Object.keys(small).join("|");
  let value = clean(text)
    .toLowerCase()
    .replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, "");
  value = value.replace(
    new RegExp(`\\b(?:${numberWords})(?:[- ](?:${numberWords}))*\\b`, "g"),
    (s) => String(s.split(/[- ]/).reduce((n, w) => n + small[w], 0)),
  );
  value = value.replace(
    /\b(\d+)\s+hundred(?:\s+(?:and\s+)?(\d{1,2}))?\b/g,
    (_, n, rest) => String(Number(n) * 100 + Number(rest || 0)),
  );
  const result: string[] = [];
  for (const m of value.matchAll(
    /\b(\d+(?:\.\d+)?)(?:\s*(thousand|million|billion|trillion|bn)\b)?(?:\s*(%|per cent\b|percent\b))?/g,
  )) {
    const scale: Record<string, number> = {
      thousand: 1e3,
      million: 1e6,
      billion: 1e9,
      trillion: 1e12,
      bn: 1e9,
    };
    result.push(`${Number(m[1]) * (scale[m[2]] || 1)}${m[3] ? "%" : ""}`);
  }
  return [...new Set(result)];
}

export function packageFingerprint(story: Story) {
  return digest(
    JSON.stringify({
      standard: CONSTRUCTION_POLICY.version,
      eventAt: story.eventAt,
      assertions: editorialAssertions(story),
      claims: story.claims.map(({ reviewed: _reviewed, ...claim }) => claim),
      sources: story.sources.map((s) => ({
        id: s.id,
        url: s.url,
        title: s.title,
        hash: s.hash,
        textHash: digest(s.text),
        publisher: s.publisher,
        author: s.author,
        kind: s.kind,
        lineage: s.lineage,
        origin: s.origin,
        language: s.language,
        publishedAt: s.publishedAt,
      })),
    }),
  );
}

export function packageContentIssues(story: Story) {
  if (!story.editorial) return [];
  const issues: string[] = [];
  const assertions = editorialAssertions(story);
  if (
    story.editorial.headline.text !== story.title ||
    story.editorial.summary.text !== story.summary
  )
    issues.push(
      "The headline or summary changed after story construction. Rebuild and check the package.",
    );
  if (new Set(assertions.map((a) => a.id)).size !== assertions.length)
    issues.push("Each editorial assertion needs a unique identifier.");
  for (const a of assertions) {
    if (
      !a.text.trim() ||
      !a.claimIds.length ||
      a.claimIds.some((id) => !story.claims.some((c) => c.id === id))
    ) {
      issues.push(
        `${a.id}: every assertion needs text and existing claim references.`,
      );
      continue;
    }
    const evidence = assertionEvidence(story, a);
    if (!evidence.length) {
      issues.push(`${a.id}: supporting passages are missing.`);
      continue;
    }
    const passages = evidence.map((e) =>
      [
        e.passage,
        story.sources.find((s) => s.id === e.sourceId)?.language !== "en"
          ? e.translation || ""
          : "",
      ].join(" "),
    );
    const evidenceNumbers = new Set(quantities(passages.join(" ")));
    let numericText = clean(a.text);
    for (const source of story.sources.filter((s) =>
      evidence.some((e) => e.sourceId === s.id),
    )) {
      const publisher = clean(source.publisher);
      if (!/\p{L}/u.test(publisher)) continue;
      const escaped = publisher.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Remove only an exact outlet name. A separate occurrence of the same
      // numeral is still a quantity and must occur in passage evidence.
      numericText = numericText.replace(
        new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu"),
        "",
      );
    }
    const unmatched = quantities(numericText).filter(
      (n) => !evidenceNumbers.has(n),
    );
    if (unmatched.length)
      issues.push(
        `${a.id}: quantities ${unmatched.join(", ")} do not occur in its linked evidence. Check numbers, dates and units.`,
      );
    const quoted = [...clean(a.text).matchAll(/"([^"\n]{2,})"/g)].map(
      (m) => m[1],
    );
    for (const quote of quoted)
      if (!passages.some((p) => clean(p).includes(quote)))
        issues.push(
          `${a.id}: a direct quotation does not match its linked evidence.`,
        );
  }
  return [...new Set(issues)];
}

export function editorialIssues(story: Story) {
  if (!story.editorial) return [];
  const issues = packageContentIssues(story);
  const check = story.editorial.check;
  if (
    !check ||
    check.standard !== CONSTRUCTION_POLICY.version ||
    check.fingerprint !== packageFingerprint(story)
  )
    return [
      ...issues,
      "The complete editorial package needs a current separate evidence check before rendering or approval.",
    ];
  const assertions = editorialAssertions(story);
  if (
    check.assertions.length !== assertions.length ||
    new Set(check.assertions.map((a) => a.id)).size !== assertions.length
  )
    issues.push(
      "The evidence check must cover the headline, summary, publishing text, every on-screen line and every narration segment.",
    );
  for (const a of assertions) {
    const checked = check.assertions.find((c) => c.id === a.id);
    const allowed = new Set(assertionEvidence(story, a).map((e) => e.sourceId));
    if (
      !checked ||
      checked.verdict !== "supported" ||
      !checked.sourceIds.length ||
      checked.sourceIds.some((id) => !allowed.has(id))
    )
      issues.push(
        `${a.id}: separate evidence check is missing, unresolved or references unrelated evidence.`,
      );
  }
  return [...new Set(issues)];
}
