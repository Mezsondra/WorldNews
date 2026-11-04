import type { Asset } from "../shared/types.js";
import geography from "./references/geography.json" with { type: "json" };
import cities from "./references/media-places.json" with { type: "json" };
export const MEDIA_CONTEXT_REFERENCE = {
  provider: cities.provider,
  commit: cities.commit,
  file: cities.file,
  hash: cities.hash,
  purpose: cities.purpose,
};

const demonyms: Record<string, string[]> = {
  FRA: ["French"],
  DEU: ["German"],
  POL: ["Polish"],
  IND: ["Indian"],
  CHN: ["Chinese"],
  RUS: ["Russian"],
  UKR: ["Ukrainian"],
  GBR: ["British"],
  TUR: ["Turkish"],
  AUS: ["Australian"],
  CAN: ["Canadian"],
  JPN: ["Japanese"],
  ESP: ["Spanish"],
  ITA: ["Italian"],
  NLD: ["Dutch"],
  BRA: ["Brazilian"],
  SWE: ["Swedish"],
};
const patterns = new Map<string, RegExp>();
const countryAliases = new Set(
  geography.places.flatMap((p) => p.aliases.map((a) => a.toLowerCase())),
);
function names(text: string, name: string, caseSensitive = false) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const key = `${caseSensitive}:${name}`;
  if (!patterns.has(key))
    patterns.set(
      key,
      new RegExp(
        `(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,
        caseSensitive ? "u" : "iu",
      ),
    );
  return patterns.get(key)!.test(text);
}
function countries(text: string) {
  return new Set(
    geography.places
      .filter((p) =>
        [...p.aliases, ...(demonyms[p.id] || [])].some((n) => names(text, n)),
      )
      .map((p) => p.id),
  );
}
function cityCountries(text: string) {
  return new Set(
    cities.places
      // Country names and publisher names containing them cannot identify a
      // same-named settlement (for example the Antarctic station "France").
      .filter(
        (p) =>
          !countryAliases.has(p.name.toLowerCase()) &&
          names(text, p.name, true),
      )
      .map((p) => p.country),
  );
}
export function mediaGeographyCompatible(asset: Asset, narration: string) {
  const explicitNarration = countries(narration);
  const narrationPlaces = explicitNarration.size
    ? explicitNarration
    : cityCountries(narration);
  const caption = [
    asset.subject,
    asset.context,
    asset.location,
    asset.sourceMedia?.title,
    asset.discovery?.title,
  ]
    .filter(Boolean)
    .join(" ");
  const city = cityCountries(caption);
  const assetPlaces = city.size ? city : countries(caption);
  // This only rules out conflicting place metadata. An unknown or matching place
  // is never proof that an image depicts this event or is cleared for reuse.
  return (
    !narrationPlaces.size ||
    !assetPlaces.size ||
    [...narrationPlaces].some((id) => assetPlaces.has(id))
  );
}

export function graphicMatchesNarration(asset: Asset, narration: string) {
  const clean = (s: string) =>
    s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return (
    !asset.graphic ||
    !asset.graphicNarration?.length ||
    asset.graphicNarration.some((clause) =>
      clean(narration).includes(clean(clause)),
    )
  );
}
