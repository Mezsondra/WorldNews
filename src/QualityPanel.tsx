import type { Render } from "../shared/types";

export function QualityPanel({
  render,
  onSeek,
}: {
  render: Render;
  onSeek: (time: number) => void;
}) {
  const report = render.quality;
  if (!report)
    return (
      <p className="hint" role="status">
        Quality checks not recorded for this export. Rebuild to check the video
        before final approval.
      </p>
    );
  const holds = report.findings.filter((f) => f.severity === "hold");
  return (
    <section className="shot-timeline" aria-label="Automatic quality checks">
      <div className="eyebrow">AUTOMATIC QUALITY CHECKS</div>
      <h2>
        {report.status === "passed"
          ? "Checks passed · editorial review remains"
          : `Preview available · ${holds.length} ${holds.length === 1 ? "check needs" : "checks need"} attention`}
      </h2>
      <p className="hint">
        {report.measurements.narrationSeconds.toFixed(1)}s narration ·{" "}
        {report.measurements.visualCoverage.toFixed(0)}% purposeful visuals ·{" "}
        {report.measurements.decoded
          ? "Complete file decoded"
          : "File check held"}
        {Number.isFinite(report.measurements.lufs)
          ? ` · ${report.measurements.lufs!.toFixed(1)} LUFS`
          : ""}
      </p>
      <p className="hint">
        These checks assess saved evidence and measurable production quality.
        They do not independently establish truth, image authenticity or speech
        alignment.
      </p>
      {!!report.repairs.length && (
        <details>
          <summary>
            {report.repairs.length} automatic repair
            {report.repairs.length === 1 ? "" : "s"}
          </summary>
          <ul>
            {report.repairs.map((r, i) => (
              <li key={i}>{r.message}</li>
            ))}
          </ul>
        </details>
      )}
      {!!report.findings.length && (
        <details open={holds.length > 0}>
          <summary>Inspect holds and review notes</summary>
          <ul>
            {report.findings.map((f, i) => (
              <li key={i}>
                <strong>
                  {f.severity === "hold" ? "Hold" : "Review note"}:
                </strong>{" "}
                {f.message}
                {f.at !== undefined && Number.isFinite(f.at) && (
                  <button className="button" onClick={() => onSeek(f.at!)}>
                    Watch {f.at.toFixed(1)}s
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
