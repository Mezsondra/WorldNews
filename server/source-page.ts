import type { Story } from "../shared/types.js";
import { escape as e } from "./media.js";
export function sourcePage(
  story: Story,
  preview = false,
  corrections = story.corrections,
) {
  const sources = story.sources;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${e(story.title)} — World News sources</title><style>body{margin:0;background:#f6f5ef;color:#21302a;font:17px/1.7 system-ui}main{max-width:780px;margin:auto;padding:50px 24px}h1{font:clamp(36px,6vw,58px)/1.1 Georgia}h2{font:28px Georgia;margin-top:44px}a{color:#365c43;overflow-wrap:anywhere}article{border-top:1px solid #d9ded4;padding:24px 0}blockquote{border-left:3px solid #8da876;padding-left:20px;color:#52604d}small,.muted{color:#687365}mark{background:#e2e9d4;padding:6px 12px}code{font-size:13px}footer{border-top:1px solid #ddd;padding-top:28px;margin-top:45px}</style></head><body><main><strong>WORLD NEWS / SOURCE RECORD</strong><p><mark>${preview ? "PRIVATE DRAFT · NOT APPROVED" : story.demo ? "APPROVED HISTORICAL DEMO · NOT CURRENT NEWS" : "EDITOR-APPROVED SOURCE RECORD"}</mark></p><h1>${e(story.title)}</h1><p>${e(story.summary)}</p><p class="muted">Event: ${e(story.eventAt)}<br>Version ${story.version} · Updated ${e(story.updatedAt)}${story.approval ? `<br>Reviewed by ${e(story.approval.editor)} on ${e(story.approval.at)}` : ""}</p><h2>Narration and supporting evidence</h2>${story.segments
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
                  ? `<blockquote>${e(item.passage)}${item.translation ? `<p>Reviewed translation: ${e(item.translation)}</p>` : ""}<br><small>${e(item.relation)} · <a rel="noopener noreferrer" href="${e(source.url)}">${e(source.publisher)}</a> · Retrieved ${e(source.retrievedAt)}</small></blockquote>`
                  : "";
              })
              .join("")}`;
          })
          .join("")}</article>`,
    )
    .join(
      "",
    )}<h2>Source registry</h2>${sources.map((source) => `<article><a rel="noopener noreferrer" href="${e(source.url)}">${e(source.title)}</a><p>${e(source.publisher)} · ${e(source.kind)} · Lineage: ${e(source.lineage)}<br>Author: ${e(source.author || "Not provided")}<br>Published: ${e(source.publishedAt || "Not provided")}<br>Retrieved: ${e(source.retrievedAt)}<br>Language: ${e(source.language)}</p><small>Snapshot SHA-256: <code>${e(source.hash)}</code></small></article>`).join("")}<h2>Corrections</h2>${corrections.length ? corrections.map((c) => `<p><strong>${e(c.at)} · v${c.version}</strong><br>${e(c.text)}</p>`).join("") : "<p>No corrections recorded.</p>"}<footer>Sources within the same lineage are not independent corroboration. These records show the evidence reviewed; they cannot guarantee that a source is correct. Narration uses a synthetic voice. ${story.demo ? "This is a historical workflow demonstration." : ""}</footer></main></body></html>`;
}
