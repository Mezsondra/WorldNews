import React, { useState } from "react";
import { visualLabel, visualReadingSeconds } from "../shared/visuals";
import type {
  Story,
  Render,
  RenderedShot,
  ShotOverride,
} from "../shared/types";

const media = (file: string) => "/media/" + file;
const normalize = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export function ShotTimeline({
  story,
  render,
  disabled,
  onSeek,
  onSave,
}: {
  story: Story;
  render: Render;
  disabled: boolean;
  onSeek: (time: number) => void;
  onSave: (override: ShotOverride) => void;
}) {
  const [selected, setSelected] = useState(render.shots?.[0]?.id || "");
  const shots = render.shots || [],
    shot = shots.find((s) => s.id === selected) || shots[0];
  if (!shot) return null;
  return (
    <section className="shot-timeline" aria-label="Visual timeline">
      <div className="timeline-heading">
        <div>
          <div className="eyebrow">VISUAL TIMELINE</div>
          <h2>{shots.length} shots · matched to the narration</h2>
        </div>
        <span>
          {render.narrationReused || 0}/{story.segments.length} audio ·{" "}
          {render.shotsReused || 0}/{shots.length} shots reused
        </span>
      </div>
      <p className="hint">
        Select a shot to inspect its place in the video. Narration continues
        across cuts.
      </p>
      {render.visualCoverage && (
        <p className="hint">
          {render.visualCoverage.percent.toFixed(0)}% purposeful visual coverage
          · closing sources excluded. {render.visualCoverage.warnings.join(" ")}
        </p>
      )}
      <div className="shot-strip" role="group" aria-label="Shots">
        {shots.map((s, i) => (
          <button
            type="button"
            key={s.id}
            className={s.id === shot.id ? "shot-item selected" : "shot-item"}
            aria-pressed={s.id === shot.id}
            aria-label={`Shot ${i + 1}, ${s.start.toFixed(1)} to ${s.end.toFixed(1)} seconds, ${s.kind}`}
            onClick={() => {
              setSelected(s.id);
              onSeek(s.start);
            }}
          >
            {s.poster ? (
              <img src={media(s.poster)} alt="" loading="lazy" />
            ) : (
              <span className="shot-placeholder">{s.kind}</span>
            )}
            <span>
              <strong>{String(i + 1).padStart(2, "0")}</strong>{" "}
              {(s.end - s.start).toFixed(1)}s
            </span>
            <small>
              {s.kind === "media" &&
              story.assets.find((a) => a.id === s.assetId)?.graphic
                ? "Original explainer"
                : visualLabel(s.kind)}
            </small>
          </button>
        ))}
      </div>
      <ShotEditor
        key={`${story.version}-${shot.id}`}
        story={story}
        shot={shot}
        plan={render.visualPlan || []}
        disabled={disabled}
        onSave={onSave}
      />
    </section>
  );
}
function ShotEditor({
  story,
  shot,
  disabled,
  onSave,
  plan,
}: {
  story: Story;
  shot: RenderedShot;
  disabled: boolean;
  onSave: (override: ShotOverride) => void;
  plan: NonNullable<Render["visualPlan"]>;
}) {
  const [visual, setVisual] = useState(
    shot.kind === "media"
      ? `asset:${shot.assetId}`
      : shot.visualId
        ? `visual:${shot.visualId}`
        : shot.kind,
  );
  const segment = story.segments.find((s) => s.id === shot.segmentId)!;
  const assets = story.assets.filter(
    (a) => !a.subject || normalize(segment.text).includes(normalize(a.subject)),
  );
  const selectedAsset = assets.find((a) => `asset:${a.id}` === visual);
  const choices = plan.filter(
    (v) =>
      v.segmentId === shot.segmentId &&
      shot.end - shot.start >= visualReadingSeconds(v.kind),
  );
  const selectedVisual = choices.find((v) => `visual:${v.id}` === visual);
  return (
    <details className="shot-editor">
      <summary>
        Edit shot {shot.id.replace("shot-", "")} · {shot.start.toFixed(1)}–
        {shot.end.toFixed(1)}s
      </summary>
      <p className="shot-narration">{segment.text}</p>
      {shot.purpose && <p className="hint">Purpose: {shot.purpose}</p>}
      {shot.visual && (
        <p className="hint">
          Evidence:{" "}
          {[
            ...new Set(
              shot.visual.evidence.map(
                (e) =>
                  story.sources.find((s) => s.id === e.sourceId)?.publisher ||
                  e.sourceId,
              ),
            ),
          ].join(" · ")}
          . Exact passages and visual decisions are saved in the manifest and
          source record.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          onSave({
            id: shot.id,
            segmentId: shot.segmentId,
            kind: visual.startsWith("asset:")
              ? "media"
              : selectedVisual?.kind || (visual as "fact" | "sources"),
            visualId: selectedVisual?.id,
            assetId: selectedAsset?.id,
            framing: form.get("framing") as ShotOverride["framing"],
            videoStart:
              selectedAsset?.mediaType === "video"
                ? Number(form.get("videoStart") || 0)
                : undefined,
          });
        }}
      >
        <label>
          Visual
          <select
            name="visual"
            value={visual}
            onChange={(e) => setVisual(e.target.value)}
            disabled={disabled}
          >
            <option value="fact">Report graphic · narration excerpt</option>
            <option value="sources">Source record · publishers & dates</option>
            {choices.map((v) => (
              <option key={v.id} value={`visual:${v.id}`}>
                {visualLabel(v.kind)} · {v.narration.slice(0, 85)}
              </option>
            ))}
            {assets.map((a) => (
              <option key={a.id} value={`asset:${a.id}`}>
                {a.mediaType === "video" ? "Video" : "Photo"} ·{" "}
                {a.subject ||
                  a.sourceMedia?.title ||
                  a.discovery?.title ||
                  a.creator}
              </option>
            ))}
          </select>
        </label>
        {selectedAsset && selectedAsset.mediaType !== "video" && (
          <label>
            Photo framing
            <select
              name="framing"
              defaultValue={shot.framing}
              disabled={disabled}
            >
              <option value="contain">Full image</option>
              <option value="portrait">Portrait crop</option>
              <option value="detail">Closer detail</option>
            </select>
          </label>
        )}
        {!selectedAsset || selectedAsset.mediaType === "video" ? (
          <input type="hidden" name="framing" value="contain" />
        ) : null}
        {selectedAsset?.mediaType === "video" && (
          <label>
            Clip start · seconds
            <input
              name="videoStart"
              type="number"
              min="0"
              max={Math.max(
                0,
                (selectedAsset.sourceMedia?.duration || 90) -
                  (shot.end - shot.start),
              )}
              step="0.1"
              defaultValue={shot.videoStart || 0}
              disabled={disabled}
            />
          </label>
        )}
        <p className="hint">
          {selectedAsset
            ? `Credit: ${selectedAsset.sourceMedia?.credit || selectedAsset.creator}`
            : "Uses the narration and its linked source records."}
        </p>
        <button className="button" disabled={disabled}>
          Save shot & rebuild
        </button>
      </form>
    </details>
  );
}
export function VersionCompare({ story }: { story: Story }) {
  const previous = [...story.renders]
    .filter((r) => r.version < story.version)
    .sort((a, b) => b.version - a.version);
  const [version, setVersion] = useState(previous[0]?.version);
  const render = previous.find((r) => r.version === version);
  if (!render) return null;
  return (
    <details className="version-compare">
      <summary>Compare previous versions</summary>
      <label>
        Previous export
        <select
          value={version}
          onChange={(e) => setVersion(Number(e.target.value))}
        >
          {previous.map((r) => (
            <option key={r.version} value={r.version}>
              v{r.version} · {r.voice} · {r.duration.toFixed(1)}s
            </option>
          ))}
        </select>
      </label>
      <video
        key={render.version}
        controls
        preload="none"
        poster={media(render.story)}
        src={media(render.video)}
      />
      <a href={media(render.video)} target="_blank" rel="noreferrer">
        Open v{render.version} video
      </a>
    </details>
  );
}
