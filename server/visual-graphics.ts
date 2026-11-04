import type { Story } from "../shared/types.js";
import type { EvidenceVisual } from "../shared/visuals.js";
import { geography } from "./visual-plan.js";
import { wrapVisualText } from "../shared/text-layout.js";

const xml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function lines(value: string, limit: number, max: number) {
  const rows = wrapVisualText(value, limit);
  if (rows.length > max)
    rows[max - 1] = rows[max - 1].replace(/\s+\S*$/, "") + "…";
  return rows.slice(0, max);
}
const text = (
  value: string,
  x: number,
  y: number,
  size: number,
  limit: number,
  max = 1,
  color = "#f5f2e8",
  bold = false,
) =>
  `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${size}" font-weight="${bold ? 700 : 400}" fill="${color}">${lines(
    value,
    limit,
    max,
  )
    .map(
      (line, i) =>
        `<tspan x="${x}" dy="${i ? size * 1.25 : 0}">${xml(line)}</tspan>`,
    )
    .join("")}</text>`;

export function evidenceGraphic(story: Story, visual: EvidenceVisual) {
  const source = story.sources.find(
    (s) => s.id === visual.evidence[0].sourceId,
  )!;
  let body = `<rect width="1080" height="1920" fill="#10251f"/><circle cx="1030" cy="570" r="500" fill="#16382e"/><path d="M72 425h100" stroke="#bed897" stroke-width="7"/>`;
  if (visual.kind === "document") {
    const translation = visual.translated;
    const full = translation
      ? visual.evidence[0].translation!
      : visual.evidence[0].passage;
    const end = full.indexOf(visual.excerpt) + visual.excerpt.length;
    const quote =
      (full.indexOf(visual.excerpt) > 0 ? "… " : "") +
      visual.excerpt +
      (end < full.length ? " …" : "");
    body += text("THE EVIDENCE", 72, 365, 30, 40, 1, "#bed897", true);
    body += `<rect x="72" y="475" width="936" height="810" rx="14" fill="#f1eee4"/><rect x="72" y="475" width="8" height="810" fill="#bed897"/>`;
    body += text(source.publisher, 118, 545, 32, 43, 1, "#234336", true);
    body += text(source.title, 118, 612, 40, 34, 2, "#112c22", true);
    body += text(
      `Published ${source.publishedAt?.slice(0, 10) || "date unconfirmed"}`,
      118,
      735,
      25,
      57,
      1,
      "#4c6357",
    );
    body += `<path d="M118 765h844" stroke="#b6c3af"/>`;
    const rows = lines(quote, 33, 7);
    // Highlight the exact excerpt as typeset text, not a fabricated page image.
    rows.forEach((row, i) => {
      body += `<rect x="108" y="${794 + i * 54}" width="856" height="52" rx="3" fill="${i === 0 ? "#d2dfad" : "#e6e8d9"}"/>`;
      body += text(row, 122, 834 + i * 54, 42, 34, 1, "#193b2b", true);
    });
    body += text(
      translation
        ? "SAVED TRANSLATION · EXCERPT"
        : "SAVED TEXT · EXACT EXCERPT",
      118,
      1245,
      24,
      55,
      1,
      "#3b5c45",
    );
    body += text(
      "Typeset from the stored passage; not a page screenshot.",
      72,
      1430,
      25,
      68,
      1,
      "#b9cebe",
    );
  } else if (visual.kind === "map") {
    body += text("GEOGRAPHIC CONTEXT", 72, 365, 30, 40, 1, "#bed897", true);
    body += text("Places in the account", 72, 485, 60, 28, 1, "#fff", true);
    const lons = visual.places.map((p) => p.lon),
      lats = visual.places.map((p) => p.lat);
    // A regional window where possible; coastlines only, without political borders.
    const spanX = Math.min(
      360,
      Math.max(75, Math.max(...lons) - Math.min(...lons) + 35),
    );
    const spanY = spanX / 1.75;
    const midX = (Math.max(...lons) + Math.min(...lons)) / 2 + 180;
    const midY = 90 - (Math.max(...lats) + Math.min(...lats)) / 2;
    const x = Math.max(0, Math.min(360 - spanX, midX - spanX / 2));
    const y = Math.max(0, Math.min(180 - spanY, midY - spanY / 2));
    body += `<svg x="72" y="550" width="936" height="535" viewBox="${x} ${y} ${spanX} ${spanY}" preserveAspectRatio="none"><rect x="0" y="0" width="360" height="180" fill="#193e39"/>`;
    for (let lon = 0; lon <= 360; lon += 15)
      body += `<path d="M${lon} 0v180" stroke="#2c554d" stroke-width=".12"/>`;
    for (let lat = 0; lat <= 180; lat += 15)
      body += `<path d="M0 ${lat}h360" stroke="#2c554d" stroke-width=".12"/>`;
    body += geography.land
      .map(
        (p) =>
          `<path d="${p}" fill="#829a7d" stroke="#a9bc96" stroke-width=".12"/>`,
      )
      .join("");
    visual.places.forEach((p, i) => {
      const cx = p.lon + 180,
        cy = 90 - p.lat,
        radius = spanX / 65;
      body += `<circle cx="${cx}" cy="${cy}" r="${radius * 1.7}" fill="#bed897" fill-opacity=".25"/><circle cx="${cx}" cy="${cy}" r="${radius}" fill="#e0edbc"/><text x="${cx}" y="${cy + radius * 0.37}" text-anchor="middle" font-family="sans-serif" font-size="${radius * 1.3}" font-weight="700" fill="#10251f">${i + 1}</text>`;
    });
    body += `</svg>`;
    visual.places.forEach((p, i) => {
      body += text(
        `${String(i + 1).padStart(2, "0")}  ${p.mention}`,
        72,
        1150 + i * 60,
        38,
        40,
        1,
        "#edf1dc",
        true,
      );
    });
    body += text(
      "Country labels only · no event sites or political borders",
      72,
      1430,
      24,
      65,
      1,
      "#b9cebe",
    );
    body += text(
      "Made with Natural Earth · public domain · locator only",
      72,
      1465,
      22,
      70,
      1,
      "#b9cebe",
    );
  } else if (visual.kind === "chart") {
    body += text("REPORTED COMPARISON", 72, 365, 30, 40, 1, "#bed897", true);
    body += text(visual.unit, 72, 485, 70, 25, 1, "#fff", true);
    const maximum = Math.max(...visual.items.map((i) => i.value));
    body += `<path d="M120 1100h840" stroke="#8fa68b" stroke-width="3"/>`;
    body += text("0", 76, 1110, 30, 5, 1, "#bed897");
    visual.items.forEach((item, i) => {
      const x = 240 + i * 390,
        height = (item.value / maximum) * 460;
      body += `<rect x="${x}" y="${1100 - height}" width="210" height="${Math.max(1, height)}" rx="5" fill="${i ? "#bed897" : "#779f89"}"/>`;
      body += text(
        item.displayedValue,
        x,
        1060 - height,
        55,
        15,
        1,
        "#fff",
        true,
      );
      body += text(item.label, x, 1180, 46, 16, 1, "#e9efdb", true);
    });
    body += text(
      "Original counts · same unit · zero baseline",
      72,
      1430,
      25,
      65,
      1,
      "#b9cebe",
    );
  } else if (visual.kind === "process") {
    body += text(
      "HOW THE SOURCE DESCRIBES IT",
      72,
      365,
      28,
      50,
      1,
      "#bed897",
      true,
    );
    body += text("The stated sequence", 72, 485, 64, 28, 1, "#fff", true);
    body += `<path d="M106 600v600" stroke="#647f6a" stroke-width="4"/>`;
    visual.steps.forEach((step, i) => {
      const y = 620 + i * 250;
      body += `<circle cx="106" cy="${y - 12}" r="29" fill="#bed897"/>`;
      body += text(String(i + 1), 94, y, 32, 2, 1, "#10251f", true);
      body += text(step, 165, y, 38, 35, 4, "#f5f2e8");
    });
    body += text(
      visual.translated
        ? "Saved translation · source order retained"
        : "Source wording and order retained · no inferred causality",
      72,
      1430,
      24,
      70,
      1,
      "#b9cebe",
    );
  } else if (visual.kind === "quote") {
    body += text("QUOTED IN THE SOURCE", 72, 365, 30, 40, 1, "#bed897", true);
    body += `<path d="M72 560v620" stroke="#bed897" stroke-width="7"/>`;
    body += text(`“${visual.quote}”`, 115, 625, 58, 27, 8, "#f5f2e8", true);
    body += text(visual.speaker, 115, 1230, 36, 42, 1, "#bed897", true);
    body += text(
      visual.translated
        ? "Saved translated quotation · not recorded speech"
        : "Exact reported quotation · not recorded speech",
      72,
      1430,
      24,
      70,
      1,
      "#b9cebe",
    );
  } else {
    body += text("DATED CONTEXT", 72, 365, 30, 40, 1, "#bed897", true);
    body += text("Dates in the account", 72, 485, 62, 28, 1, "#fff", true);
    body += `<path d="M99 580V1260" stroke="#637f69" stroke-width="4"/>`;
    visual.items.forEach((item, i) => {
      const y = 590 + i * (visual.items.length === 2 ? 330 : 230);
      const s = story.sources.find((s) => s.id === item.evidence.sourceId)!;
      body += `<circle cx="99" cy="${y - 12}" r="11" fill="#bed897"/>`;
      body += text(item.date, 145, y, 39, 35, 1, "#d0e5a7", true);
      body += text(item.excerpt, 145, y + 60, 35, 40, 3, "#f5f2e8");
      body += text(
        s.publisher +
          (item.evidence.translation
            ? " · saved translation"
            : " · source excerpt"),
        145,
        y + 190,
        23,
        58,
        1,
        "#b9cebe",
      );
    });
    body += text(
      "Source wording retained; planned events remain plans.",
      72,
      1430,
      25,
      63,
      1,
      "#b9cebe",
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">${body}</svg>`;
}
