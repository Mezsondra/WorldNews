const small =
  "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(
    " ",
  );
const tens =
  "zero ten twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
const ordinals =
  "zeroth first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth twentieth".split(
    " ",
  );
const months = new Set(
  "january february march april may june july august september october november december".split(
    " ",
  ),
);
const spokenInteger = (n: number): string =>
  n < 20
    ? small[n]
    : n < 100
      ? tens[Math.floor(n / 10)] + (n % 10 ? " " + spokenInteger(n % 10) : "")
      : n < 1000
        ? small[Math.floor(n / 100)] +
          " hundred" +
          (n % 100 ? " " + spokenInteger(n % 100) : "")
        : n < 10000
          ? small[Math.floor(n / 1000)] +
            " thousand" +
            (n % 1000 ? " " + spokenInteger(n % 1000) : "")
          : String(n);
const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b(?:[a-z]\.){2,}/g, (abbreviation) =>
      abbreviation.replace(/\./g, ""),
    )
    .replace(/['’]/g, "")
    .replace(/(?<=\d)(?=\p{L})|(?<=\p{L})(?=\d)/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordsPattern = (s: string) =>
  s
    .split(" ")
    .map(escape)
    .join("\\s+")
    .replace(/hundred/g, "hundred(?:\\s+and)?")
    .replace(/thousand/g, "thousand(?:\\s+and)?");

// Literal token comparison with enumerated spoken forms, never edit distance.
// Word boundaries remain meaningful: "now here" is not "nowhere".
export function equivalentSpeech(script: string, recognition: string) {
  const tokens = normalize(script).split(/\s+/);
  const pattern = tokens
    .map((token, i) => {
      if (token === "usagov")
        return "(?:usagov|usa\\s+(?:dot\\s+)?gov|u\\s+s\\s+a\\s+(?:dot\\s+)?gov)";
      if (!/^\d{1,4}$/.test(token)) return escape(token);
      const n = Number(token),
        forms = [escape(token), String(n), wordsPattern(spokenInteger(n))];
      if (n >= 2000 && n < 2100)
        forms.push(
          wordsPattern(
            "twenty " + (n % 100 ? spokenInteger(n % 100) : "hundred"),
          ),
        );
      // Ordinal readings only immediately after an explicit month.
      if (months.has(tokens[i - 1]) && n >= 1 && n <= 31)
        forms.push(
          wordsPattern(
            n <= 20
              ? ordinals[n]
              : n === 30
                ? "thirtieth"
                : tens[Math.floor(n / 10)] + " " + ordinals[n % 10],
          ),
        );
      return `(?:${forms.join("|")})`;
    })
    .join("\\s+");
  return new RegExp(`^${pattern}$`, "u").test(normalize(recognition));
}
