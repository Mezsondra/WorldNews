import test from "node:test";
import assert from "node:assert/strict";
import { equivalentSpeech } from "../server/speech-equivalence.js";
import { alignScriptWords } from "../server/editorial-plan.js";

test("spoken numerals, explicit month dates and USAGov retain the same literal meaning", () => {
  assert(
    equivalentSpeech(
      "France 24 reports 58 million on November 3.",
      "France twenty four reports fifty eight million on November third.",
    ),
  );
  assert(
    equivalentSpeech(
      "USAGov says all 435 House seats.",
      "USA Gov says all four hundred and thirty five House seats.",
    ),
  );
  assert(
    equivalentSpeech("November 3, 2026", "November third, twenty twenty six"),
  );
  assert(equivalentSpeech("early-ballot tally", "early ballot tally"));
});

test("quantity, date, name, negation and word-boundary changes still require review", () => {
  for (const [script, spoken] of [
    ["435 House seats", "four hundred and thirty six House seats"],
    ["November 3", "November fourth"],
    ["A different third is elected", "A different three is elected"],
    ["Anna Korwin spoke", "Anna Corwin spoke"],
    ["Results are not final", "Results are final"],
    ["Voters are now here", "Voters are nowhere"],
  ])
    assert(!equivalentSpeech(script, spoken), `${script} versus ${spoken}`);
});

test("a five-token spoken number keeps its complete measured span", () => {
  const words = "All four hundred and thirty five House seats"
    .split(" ")
    .map((text, i) => ({ text, start: i * 300, end: (i + 1) * 300 }));
  const aligned = alignScriptWords("All 435 House seats", words);
  assert.deepEqual(
    aligned.words.find((w) => w.text === "435"),
    { text: "435", start: 300, end: 1800 },
  );
});
