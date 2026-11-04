import { createHash } from "node:crypto";
import { z } from "zod";
import type { Asset } from "../shared/types.js";
import type { MediaRights } from "../shared/media-rights.js";

const httpUrl = z
  .string()
  .max(2048)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }, "Use an HTTP(S) evidence address without embedded credentials.");
export const mediaRightsSchema = z.object({
  status: z.enum(["pending", "cleared", "restricted", "blocked"]),
  basis: z.enum([
    "unconfirmed",
    "owned",
    "permission",
    "license",
    "public-domain",
  ]),
  holder: z.string().trim().max(500),
  evidence: z.string().trim().max(2000),
  evidenceUrl: httpUrl.optional(),
  licenseUrl: httpUrl.optional(),
  expiresAt: z.string().datetime().optional(),
  allowedUses: z.array(z.enum(["private-preview", "public-video"])).max(2),
  commercialUse: z.boolean(),
  adaptations: z.boolean(),
  credit: z.string().trim().max(140),
  changes: z.string().trim().max(1000),
  restrictions: z.string().trim().max(1000),
  shareAlikePlan: z.string().trim().max(1200),
  contextChecked: z.boolean(),
  reviewedBy: z.string().trim().max(100),
});
export function assetRightsFingerprint(asset: Asset) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        file: asset.file,
        contentHash: asset.contentHash,
        mediaType: asset.mediaType,
        graphic: asset.graphic,
        graphicNarration: asset.graphicNarration,
        creator: asset.creator,
        permission: asset.permission,
        provenance: asset.provenance,
        context: asset.context,
        subject: asset.subject,
        eventDate: asset.eventDate,
        location: asset.location,
        archive: asset.archive,
        source: asset.sourceMedia && {
          hash: asset.sourceMedia.hash,
          sourceId: asset.sourceMedia.sourceId,
          credit: asset.sourceMedia.credit,
          title: asset.sourceMedia.title,
          changes: asset.sourceMedia.changes,
          captureDate: asset.sourceMedia.captureDate,
        },
        discovery: asset.discovery && {
          hash: asset.discovery.hash,
          license: asset.discovery.licenseUrl,
          source: asset.discovery.sourceUrl,
          changes: asset.discovery.changes,
        },
      }),
    )
    .digest("hex");
}
export function mediaRightsIssues(
  asset: Asset,
  use: "private-preview" | "public-video",
): string[] {
  const r = asset.rights;
  const tag =
    asset.subject || asset.sourceMedia?.title || asset.creator || asset.id;
  const fail = (message: string) => [`${tag}: ${message}`];
  if (r?.status === "blocked")
    return fail("media use is explicitly blocked. Choose another visual.");
  if (r?.expiresAt && Date.parse(r.expiresAt) <= Date.now())
    return fail("the recorded permission has expired. Review the asset again.");
  if (use === "private-preview" && (!r || r.status === "pending")) return [];
  if (!r || r.status === "pending")
    return fail(
      "record a documented media-rights decision before final production.",
    );
  if (r.fingerprint !== assetRightsFingerprint(asset))
    return fail(
      "the rights decision belongs to different media or context. Review it again.",
    );
  if (!r.allowedUses.includes(use))
    return fail(
      `the recorded permission does not allow ${use === "public-video" ? "public video" : "private previews"}.`,
    );
  if (use === "private-preview") return [];
  if (r.status !== "cleared")
    return fail("restricted media is not cleared for final public video.");
  if (
    !r.contextChecked ||
    r.basis === "unconfirmed" ||
    !r.reviewedBy.trim() ||
    !Number.isFinite(Date.parse(r.reviewedAt)) ||
    r.evidence.trim().length < 20 ||
    !r.holder.trim() ||
    !r.credit.trim() ||
    !r.changes.trim()
  )
    return fail(
      "complete the permission basis, holder, evidence, credit, changes and context review.",
    );
  if (!r.commercialUse || !r.adaptations)
    return fail(
      "this production profile requires documented commercial reuse and adaptation permission.",
    );
  if (r.basis === "license") {
    if (!r.licenseUrl) return fail("record the applicable license address.");
    const license = `${asset.permission} ${asset.discovery?.licenseUrl || ""} ${r.licenseUrl}`;
    if (
      /\bNC\b|\bND\b|by-nc|by-nd|non.?commercial|no.?derivatives/i.test(license)
    )
      return fail(
        "the recorded license conflicts with this commercial, adapted-video profile. Use a separate documented grant or another visual.",
      );
    if (
      /by-sa|BY-SA|ShareAlike/i.test(license) &&
      r.shareAlikePlan.trim().length < 20
    )
      return fail(
        "record how the applicable ShareAlike obligations will be met.",
      );
  }
  return [];
}
export function recordMediaRights(asset: Asset, raw: unknown): MediaRights {
  const input = mediaRightsSchema.parse(raw);
  if (
    input.status !== "pending" &&
    (input.reviewedBy.length < 2 || input.evidence.length < 20)
  )
    throw new Error(
      "Record the reviewer and at least 20 characters of evidence or the reason for the restriction.",
    );
  const decision = {
    ...input,
    allowedUses: [...new Set(input.allowedUses)],
    fingerprint: assetRightsFingerprint(asset),
    reviewedAt: new Date().toISOString(),
  };
  if (input.status === "cleared") {
    if (!input.allowedUses.includes("private-preview"))
      throw new Error(
        "Clearance for this workflow must also allow the private editorial preview.",
      );
    const issues = mediaRightsIssues(
      { ...asset, rights: decision },
      "public-video",
    );
    if (issues.length) throw new Error(issues.join(" "));
  }
  return decision;
}
export function assetCredit(asset: Asset) {
  return (
    asset.rights?.credit.trim() ||
    asset.sourceMedia?.credit ||
    `${asset.creator} · ${asset.permission}`
  );
}
export function publicMediaRights(rights: MediaRights | undefined) {
  if (!rights) return undefined;
  const {
    evidence: _evidence,
    evidenceUrl: _evidenceUrl,
    reviewedBy: _reviewedBy,
    ...publicRecord
  } = rights;
  return publicRecord;
}
