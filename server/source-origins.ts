import type { Source } from "../shared/types.js";
import { z } from "zod";

export const sourceOriginSchema = z.object({
  kind: z.enum(["original", "derived", "unknown"]),
  key: z.string().trim().max(200),
  parentSourceIds: z.array(z.string().trim().min(1).max(80)).max(8),
  explanation: z.string().trim().min(1).max(800),
});

const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const unknown = (s: string) =>
  !normalize(s) || /unassessed|unknown|uncertain|pending/i.test(s);
const host = (s: Source) => {
  try {
    return new URL(s.url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

export function originGraphIssues(sources: Source[]): string[] {
  const errors: string[] = [];
  const ids = new Set(sources.map((s) => s.id));
  for (const s of sources) {
    const o = s.origin;
    if (!o) continue;
    if (o.parentSourceIds.some((id) => !ids.has(id) || id === s.id))
      errors.push(
        `${s.id}: source origin references an unknown source or itself.`,
      );
    if (o.kind === "original" && (o.parentSourceIds.length || unknown(o.key)))
      errors.push(
        `${s.id}: an original source needs a known origin and no parent sources.`,
      );
    if (o.kind === "derived" && unknown(o.key) && !o.parentSourceIds.length)
      errors.push(
        `${s.id}: derived reporting needs a named origin or a parent source.`,
      );
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const walk = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const parent of sources.find((s) => s.id === id)?.origin
      ?.parentSourceIds || [])
      if (ids.has(parent) && walk(parent)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if (sources.some((s) => walk(s.id)))
    errors.push("Source origin relationships contain a cycle.");
  return [...new Set(errors)];
}

// Count connected origins, never domains alone. Identical snapshots, publisher
// hosts, named origins and explicit parent links conservatively share one group.
export function independentOrigins(sources: Source[], supportingIds: string[]) {
  if (originGraphIssues(sources).length) return [];
  const parents = new Map(sources.map((s) => [s.id, s.id]));
  const root = (id: string): string => {
    const p = parents.get(id)!;
    if (p === id) return id;
    const r = root(p);
    parents.set(id, r);
    return r;
  };
  const join = (a: string, b: string) => parents.set(root(a), root(b));
  const keys = new Map<string, string>();
  const qualified = new Set<string>();
  for (const s of sources) {
    const o = s.origin;
    const lineage = o ? o.key : s.lineage;
    if (o?.kind !== "unknown" && !unknown(lineage)) qualified.add(s.id);
    const hints = [
      host(s) && `host:${host(s)}`,
      s.hash && `hash:${s.hash}`,
      !unknown(lineage) && `origin:${normalize(lineage)}`,
    ].filter((v): v is string => !!v);
    for (const hint of hints) {
      const other = keys.get(hint);
      if (other) join(s.id, other);
      else keys.set(hint, s.id);
    }
    for (const id of o?.parentSourceIds || []) join(s.id, id);
  }
  return [
    ...new Set(
      supportingIds
        .filter((id) => parents.has(id) && qualified.has(id))
        .map(root),
    ),
  ];
}
