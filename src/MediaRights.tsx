import { useState } from "react";
import type { Asset, Story } from "../shared/types";
import type { MediaRights } from "../shared/media-rights";

export function MediaRightsEditor({
  asset,
  story,
  disabled,
  act,
}: {
  asset: Asset;
  story: Story;
  disabled: boolean;
  act: (fn: () => Promise<unknown>, message?: string) => Promise<void>;
}) {
  const previous = asset.rights;
  const [status, setStatus] = useState<MediaRights["status"]>(
    previous?.status || "pending",
  );
  const [basis, setBasis] = useState<MediaRights["basis"]>(
    previous?.basis || (asset.discovery ? "license" : "unconfirmed"),
  );
  return (
    <details className="media-rights-editor">
      <summary>
        Reuse decision · {previous?.status || "documentation pending"}
      </summary>
      <p className="hint">
        Record what permits this exact image or clip to be used. Identity review
        and a source credit do not establish permission. Public-video clearance
        must cover the intended commercial use and visual changes.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const get = (key: string) => String(form.get(key) || "").trim();
          void act(async () => {
            const response = await fetch(
              `/api/stories/${story.id}/assets/${asset.id}/rights`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  version: story.version,
                  decision: {
                    status,
                    basis,
                    holder: get("holder"),
                    evidence: get("evidence"),
                    evidenceUrl: get("evidenceUrl") || undefined,
                    licenseUrl: get("licenseUrl") || undefined,
                    expiresAt: get("expiresOn")
                      ? `${get("expiresOn")}T23:59:59.999Z`
                      : undefined,
                    allowedUses: [
                      form.has("privateUse") && "private-preview",
                      form.has("publicUse") && "public-video",
                    ].filter(Boolean),
                    commercialUse: form.has("commercialUse"),
                    adaptations: form.has("adaptations"),
                    credit: get("credit"),
                    changes: get("changes"),
                    restrictions: get("restrictions"),
                    shareAlikePlan: get("shareAlikePlan"),
                    contextChecked: form.has("contextChecked"),
                    reviewedBy: get("reviewedBy"),
                  },
                }),
              },
            );
            const result = await response.json();
            if (!response.ok)
              throw new Error(
                result.error || "The reuse decision could not be saved.",
              );
            return result;
          }, "Media reuse decision saved in a new revision. Render and inspect that revision before approval.");
        }}
      >
        <label>
          Decision
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as MediaRights["status"])}
            disabled={disabled}
          >
            <option value="pending">Pending documentation</option>
            <option value="cleared">Cleared for this production profile</option>
            <option value="restricted">Restricted to recorded uses</option>
            <option value="blocked">Blocked · use another visual</option>
          </select>
        </label>
        <label>
          Permission basis
          <select
            value={basis}
            onChange={(e) => setBasis(e.target.value as MediaRights["basis"])}
            disabled={disabled}
          >
            <option value="unconfirmed">Not established</option>
            <option value="owned">Owned material</option>
            <option value="permission">
              Documented permission / separate grant
            </option>
            <option value="license">License</option>
            <option value="public-domain">
              Documented public-domain basis
            </option>
          </select>
        </label>
        {[
          ["holder", "Rights holder", previous?.holder || asset.creator],
          [
            "licenseUrl",
            "Public license URL",
            previous?.licenseUrl || asset.discovery?.licenseUrl || "",
          ],
          [
            "evidenceUrl",
            "Private evidence reference URL · kept out of public source pages",
            previous?.evidenceUrl || "",
          ],
          [
            "credit",
            "Public on-screen credit",
            previous?.credit ||
              asset.sourceMedia?.credit ||
              `${asset.creator} · ${asset.permission}`,
          ],
          [
            "changes",
            "Public description of changes",
            previous?.changes ||
              asset.sourceMedia?.changes ||
              asset.discovery?.changes ||
              "Resized and converted to PNG; framing may be adjusted.",
          ],
          [
            "restrictions",
            "Public use limits / restrictions",
            previous?.restrictions || "",
          ],
          [
            "shareAlikePlan",
            "How applicable ShareAlike obligations will be met",
            previous?.shareAlikePlan || "",
          ],
          ["reviewedBy", "Reviewing editor", previous?.reviewedBy || ""],
        ].map(([name, label, value]) => (
          <label key={name}>
            {label}
            <input
              name={name}
              type={name.endsWith("Url") ? "url" : "text"}
              defaultValue={value}
              maxLength={name === "reviewedBy" ? 100 : 1200}
              disabled={disabled}
            />
          </label>
        ))}
        <label>
          Private documentation / decision reason
          <textarea
            name="evidence"
            defaultValue={previous?.evidence || ""}
            minLength={status === "pending" ? undefined : 20}
            maxLength={2000}
            required={status !== "pending"}
            disabled={disabled}
          />
        </label>
        <label>
          Permission expires · UTC date (optional)
          <input
            name="expiresOn"
            type="date"
            defaultValue={previous?.expiresAt?.slice(0, 10) || ""}
            disabled={disabled}
          />
        </label>
        {[
          [
            "privateUse",
            "Private preview use",
            previous?.allowedUses.includes("private-preview") ?? true,
          ],
          [
            "publicUse",
            "Public video use",
            previous?.allowedUses.includes("public-video") ?? false,
          ],
          [
            "commercialUse",
            "The documented basis permits commercial reuse",
            previous?.commercialUse || false,
          ],
          [
            "adaptations",
            "The documented basis permits the described visual changes",
            previous?.adaptations || false,
          ],
          [
            "contextChecked",
            "I checked identity, capture context, archive labelling and credit",
            previous?.contextChecked || false,
          ],
        ].map(([name, label, checked]) => (
          <label key={String(name)} className="review-check">
            <input
              type="checkbox"
              name={String(name)}
              defaultChecked={Boolean(checked)}
              disabled={disabled}
            />
            <span>{label}</span>
          </label>
        ))}
        <button className="button" disabled={disabled}>
          Save reuse decision
        </button>
      </form>
    </details>
  );
}
