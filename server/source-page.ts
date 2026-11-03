import type { Story } from "../shared/types.js";
import { escape as e } from "./media.js";
import { usedVisualAssets, usedReportingSources } from "./production-record.js";
import {
  assertionEvidence,
  editorialAssertions,
  editorialIssues,
} from "./editorial-check.js";
import { geography } from "./visual-plan.js";
import type { Asset } from "../shared/types.js";
export function sourcePage(
  story: Story,
  preview = false,
  corrections = story.corrections,
) {
  const sources = story.sources;
  const usedSources = usedReportingSources(story);
  const usedIds = new Set(usedSources.map((s) => s.id));
  const otherSources = sources.filter((s) => !usedIds.has(s.id));
  const usedAssets = usedVisualAssets(story);
  const rightsRecord = (a: Asset) =>
    a.rights
      ? `<p>Reuse decision: ${e(a.rights.status)} · Basis: ${e(a.rights.basis)}${a.rights.expiresAt ? `<br>Permission expires: ${e(a.rights.expiresAt)}` : ""}<br>Credit: ${e(a.rights.credit)}<br>Changes: ${e(a.rights.changes)}<br>Use limits: ${e(a.rights.restrictions || "None recorded")}${a.rights.licenseUrl ? `<br><a href="${e(a.rights.licenseUrl)}" rel="noopener noreferrer">Applicable license</a>` : ""}</p>${preview ? `<details><summary>Private decision documentation</summary><p>${e(a.rights.evidence)}</p><p>Reviewer: ${e(a.rights.reviewedBy || "not recorded")} · ${e(a.rights.reviewedAt)}</p>${a.rights.evidenceUrl ? `<a href="${e(a.rights.evidenceUrl)}" rel="noopener noreferrer">Private evidence reference</a>` : ""}</details>` : ""}`
      : `<p>Documented reuse decision pending. A source credit or context review does not establish permission.</p>`;
  const mediaRightsRecord = usedAssets.length
    ? `<h2>Media reuse decisions</h2>${usedAssets.map((a) => `<article><strong>${e(a.sourceMedia?.title || a.discovery?.title || a.creator)}</strong>${rightsRecord(a)}</article>`).join("")}`
    : "";
  const visualShots =
    story.renders
      .find((r) => r.version === story.version)
      ?.shots?.filter((s) => s.visual) || [];
  const visualRecord = visualShots.length
    ? `<h2>Explanatory visual decisions</h2><p>These graphics are typeset from saved evidence. Document treatments are text excerpts, not screenshots. Maps locate country label points, not incident sites. Timeline order does not establish causality.</p>${visualShots.map((s) => `<details><summary>${s.start.toFixed(1)}–${s.end.toFixed(1)}s · ${e(s.kind)} · ${e(s.id)}</summary><p>Narration: ${e(s.narration || "")}</p><p>${e(s.purpose || "")}</p>${s.visual!.evidence.map((ref) => `<blockquote>${e(ref.passage)}${ref.translation ? `<p>Saved translation: ${e(ref.translation)}</p>` : ""}<br><small>${e(sources.find((source) => source.id === ref.sourceId)?.publisher || ref.sourceId)} · claim ${e(ref.claimId)}</small></blockquote>`).join("")}</details>`).join("")}${visualShots.some((s) => s.kind === "map") ? `<p>Map geometry and label reference points: <a href="${geography.terms}" rel="noopener noreferrer">Natural Earth · public domain</a>. Coastlines only; no political borders. Dataset revision <code>${e(geography.commit)}</code>. <a href="${geography.repository}/tree/${geography.commit}/geojson" rel="noopener noreferrer">Original data files</a>. Label points do not indicate an event site or precise location.</p>` : ""}`
    : "";
  const packageRecord = story.editorial
    ? `<h2>Complete story package</h2><p>${editorialIssues(story).length ? "The automated package check needs attention." : "A separate automated check is recorded for this wording. Editorial review remains a separate decision."}</p>${editorialAssertions(
        story,
      )
        .filter((a) => !a.id.startsWith("segment:"))
        .map(
          (a) =>
            `<article><small>${e(a.id)}</small><p>${e(a.text)}</p>${assertionEvidence(
              story,
              a,
            )
              .map((item) => {
                const source = sources.find((s) => s.id === item.sourceId);
                return source
                  ? `<blockquote>${e(item.passage)}<br><small><a href="${e(source.url)}" rel="noopener noreferrer">${e(source.publisher)}</a></small></blockquote>`
                  : "";
              })
              .join("")}</article>`,
        )
        .join("")}`
    : "";
  const credits = usedAssets.length
    ? `<h2>Visual credits and archive context</h2>${usedAssets.map((a) => (a.graphic ? `<article><strong>${e(a.sourceMedia?.title || "Original explainer graphic")}</strong><p>ORIGINAL EXPLAINER GRAPHIC · ${e(a.creator)}<br>Reporting snapshot: ${e(a.eventDate)} · ${e(a.location)}</p><p>${e(a.context)}</p><p>Credit: ${e(a.sourceMedia?.credit || a.creator)}</p><p><a href="${e(a.provenance)}" rel="noopener noreferrer">Original vector artwork</a></p><p>${e(a.permission)}</p><small>PNG SHA-256: ${e(a.contentHash || "not recorded")}</small></article>` : a.sourceMedia ? `<article><strong>${e(a.sourceMedia.title)}</strong><p>Credit: ${e(a.sourceMedia.credit)} · via ${e(a.sourceMedia.publisher)}</p><p>${a.mediaType === "video" ? "VIDEO EXCERPT" : "SOURCE PHOTO"} · Published ${e(a.sourceMedia.publishedAt || "date unconfirmed")} · ${a.sourceMedia.captureDate ? "Source media dated " + e(a.sourceMedia.captureDate) : "Capture date unconfirmed"}</p><p>${e(a.context)}</p><p><a href="${e(a.provenance)}" rel="noopener noreferrer">Original source report and credits</a></p><p>${e(a.sourceMedia.changes)}</p><p>${e(a.permission)}</p><small>Retrieved ${e(a.sourceMedia.retrievedAt)} · SHA-256 ${e(a.sourceMedia.hash)} · ${a.sourceMedia.reviewed ? "Media review recorded" : "Media context and reuse review pending"}</small></article>` : `<article><strong>${e(a.discovery?.title || a.context)}</strong><p>${e(a.creator)} · ${e(a.permission)}<br>${a.graphic ? "ORIGINAL EXPLAINER GRAPHIC" : a.archive ? "ARCHIVE / CONTEXT IMAGE" : "Event image"} · ${a.graphic ? "Reporting date" : "Photo date"}: ${e(a.eventDate)} · ${e(a.location)}</p><p>${e(a.context)}</p>${a.discovery ? `<p><a href="${e(a.discovery.sourceUrl)}" rel="noopener noreferrer">Original Commons file and attribution</a> · <a href="${e(a.discovery.licenseUrl)}" rel="noopener noreferrer">Image license</a></p><p>${e(a.discovery.changes)}</p><small>Retrieved ${e(a.discovery.retrievedAt)} · SHA-256 ${e(a.discovery.hash)} · ${a.discovery.reviewed ? "Media review recorded" : "Media identity and license review pending"}</small>` : `<p>Provenance: ${e(a.provenance)}</p>`}</article>`)).join("")}`
    : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${e(story.title)} — World News sources</title><style>body{margin:0;background:#f6f5ef;color:#21302a;font:17px/1.7 system-ui}main{max-width:780px;margin:auto;padding:50px 24px}h1{font:clamp(36px,6vw,58px)/1.1 Georgia}h2{font:28px Georgia;margin-top:44px}a{color:#365c43;overflow-wrap:anywhere}article{border-top:1px solid #d9ded4;padding:24px 0}blockquote{border-left:3px solid #8da876;padding-left:20px;color:#52604d}small,.muted{color:#687365}mark{background:#e2e9d4;padding:6px 12px}code{font-size:13px}footer{border-top:1px solid #ddd;padding-top:28px;margin-top:45px}</style></head><body><main><strong>WORLD NEWS / SOURCE RECORD</strong><p><mark>${preview ? "PRIVATE DRAFT · NOT APPROVED" : story.demo ? "APPROVED HISTORICAL DEMO · NOT CURRENT NEWS" : "EDITOR-APPROVED SOURCE RECORD"}</mark></p><h1>${e(story.title)}</h1><p>${e(story.summary)}</p><p class="muted">Event: ${e(story.eventAt)}<br>Version ${story.version} · Updated ${e(story.updatedAt)}${story.approval ? `<br>Reviewed by ${e(story.approval.editor)} on ${e(story.approval.at)}` : ""}</p>${packageRecord}<h2>Narration and supporting evidence</h2>${story.segments
    .map(
      (segment, i) =>
        `<article><small>SEGMENT ${i + 1}</small><p>${e(segment.text)}</p>${segment.claimIds
          .map((cid) => {
            const claim = story.claims.find((c) => c.id === cid);
            if (!claim) return "";
            return `<p><small>${e(cid)} · ${e(claim.status)} · ${claim.reviewed ? "Editor checked" : "Needs review"}</small></p>${claim.evidence
              .map((item) => {
                const source = sources.find((s) => s.id === item.sourceId);
                return source
                  ? `<blockquote>${e(item.passage)}${item.translation ? `<p>Saved English translation: ${e(item.translation)}</p>` : ""}<br><small>${e(item.relation)} · <a rel="noopener noreferrer" href="${e(source.url)}">${e(source.publisher)}</a> · Retrieved ${e(source.retrievedAt)}</small></blockquote>`
                  : "";
              })
              .join("")}`;
          })
          .join("")}</article>`,
    )
    .join(
      "",
    )}<h2>Reporting sources used</h2>${usedSources.map((source) => `<article><a rel="noopener noreferrer" href="${e(source.url)}">${e(source.title)}</a><p>${e(source.publisher)} · ${e(source.kind)} · Lineage: ${e(source.lineage)}${source.origin ? `<br>Origin: ${e(source.origin.kind)} · ${e(source.origin.key || "not established")}<br>${e(source.origin.explanation)}<br>Based on: ${e(source.origin.parentSourceIds.map((id) => sources.find((s) => s.id === id)?.publisher || id).join(", ") || "No attached parent sources")}` : ""}<br>Author: ${e(source.author || "Not provided")}<br>Published: ${e(source.publishedAt || "Not provided")}<br>Retrieved: ${e(source.retrievedAt)}<br>Language: ${e(source.language)}</p><small>Snapshot SHA-256: <code>${e(source.hash)}</code></small></article>`).join("")}${credits}${mediaRightsRecord}${visualRecord}${otherSources.length ? `<h2>Other research sources</h2><p>These records were researched but are not cited as support for this narration.</p>${otherSources.map((source) => `<article><a href="${e(source.url)}" rel="noopener noreferrer">${e(source.title)}</a><p>${e(source.publisher)} · ${e(source.publishedAt || "Date not supplied")}</p></article>`).join("")}` : ""}<h2>Corrections</h2>${corrections.length ? corrections.map((c) => `<p><strong>${e(c.at)} · v${c.version}</strong><br>${e(c.text)}</p>`).join("") : "<p>No corrections recorded.</p>"}<footer>Sources within the same lineage are not independent corroboration. These records show the evidence reviewed; they cannot guarantee that a source is correct. Narration uses a synthetic voice. ${story.demo ? "This is a historical workflow demonstration." : ""}</footer></main></body></html>`;
}
