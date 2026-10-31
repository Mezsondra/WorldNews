import { useEffect, useState } from "react";
import {
  Sparkles,
  Search,
  FileText,
  ShieldCheck,
  AlertCircle,
  Check,
} from "lucide-react";
import type { AIReport, PilotStatus, Story } from "../shared/types";
type Act = (fn: () => Promise<unknown>, message?: string) => Promise<void>;
async function call(url: string, body?: unknown) {
  const r = await fetch("/api" + url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Provider request failed.");
  return data;
}
export function AssistantPanel({
  story,
  pilot,
  disabled,
  act,
}: {
  story: Story;
  pilot?: PilotStatus;
  disabled: boolean;
  act: Act;
}) {
  const [reports, setReports] = useState<AIReport[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [reportId, setReportId] = useState("");
  useEffect(() => {
    void call(`/stories/${story.id}/ai-reports`)
      .then(setReports)
      .catch(() => {});
  }, [story.id, story.version, refresh]);
  const attempted = (kind: string) =>
    pilot?.events.some(
      (e) => e.operationKey === `${story.id}:${story.version}:claude:${kind}`,
    );
  async function assist(kind: "research" | "draft") {
    await act(
      async () => {
        try {
          await call(`/stories/${story.id}/assist`, {
            version: story.version,
            kind,
          });
        } finally {
          setRefresh((n) => n + 1);
        }
      },
      kind === "draft"
        ? "Claude’s result is ready. Inspect its evidence and review every generated claim."
        : "Source analysis is ready. Research gaps still need follow-up.",
    );
  }
  const latest = reports.find((r) => r.id === reportId) || reports[0];
  return (
    <section className="editor-section assistant-panel">
      <div className="section-title">
        <h2>Editorial assistant</h2>
        <Sparkles size={18} />
      </div>
      <p className="hint">
        Claude analyzes attached source snapshots. It can flag gaps and draft
        narration; it does not search the web or approve facts.
      </p>
      <div className="assistant-actions">
        <button
          className="button"
          disabled={
            disabled ||
            !story.sources.length ||
            !pilot?.enabled ||
            !pilot.providers.claude ||
            pilot.remainingUsd < 0.5 ||
            attempted("research")
          }
          onClick={() => void assist("research")}
        >
          <Search size={14} />
          Analyze sources
        </button>
        <button
          className="button primary"
          disabled={
            disabled ||
            !story.sources.length ||
            !pilot?.enabled ||
            !pilot.providers.claude ||
            pilot.remainingUsd < 0.5 ||
            attempted("draft")
          }
          onClick={() => void assist("draft")}
        >
          <FileText size={14} />
          Draft narration
        </button>
      </div>
      <small className="provider-note">
        US$0.50 reserved per request. Drafting replaces the current script with
        a new, unreviewed revision. Failed attempts retain their reservation.
      </small>
      {!pilot?.enabled && <p className="hint">Live API calls are disabled.</p>}
      {(story.sources.length > 5 ||
        story.sources.some((s) => s.text.length > 5000)) && (
        <p className="provider-note">
          Analysis covers the first 5,000 characters of each of the first five
          sources. Inspect the full snapshots when checking evidence gaps.
        </p>
      )}
      {reports.length > 1 && (
        <label>
          Saved assistant report
          <select
            value={latest?.id || ""}
            onChange={(e) => setReportId(e.target.value)}
          >
            {reports.map((report) => (
              <option key={report.id} value={report.id}>
                {report.kind === "research"
                  ? "Source analysis"
                  : "Draft result"}{" "}
                · v{report.version} ·{" "}
                {new Date(report.createdAt).toLocaleTimeString()}
              </option>
            ))}
          </select>
        </label>
      )}
      {latest && (
        <details className="ai-report" key={latest.id} open>
          <summary>
            {latest.kind === "research" ? "Source analysis" : "Draft result"} ·
            v{latest.version}
          </summary>
          {typeof latest.data.summary === "string" && (
            <p>{latest.data.summary}</p>
          )}
          {typeof latest.data.validationError === "string" && (
            <p className="render-error">
              Not applied: {latest.data.validationError}
            </p>
          )}
          {typeof latest.data.reason === "string" && latest.data.reason && (
            <p>{latest.data.reason}</p>
          )}
          {["gaps", "perspectives", "cautions"].map(
            (field) =>
              Array.isArray(latest.data[field]) && (
                <div key={field}>
                  <strong>{field}</strong>
                  <ul>
                    {(latest.data[field] as string[]).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ),
          )}
          {latest.kind === "draft" && (
            <p className="hint">
              {latest.data.outcome === "hold"
                ? "The sources did not support a substantive draft. Add evidence before trying a new revision."
                : "Generated claims remain unchecked. Review the script and passages below."}
            </p>
          )}
        </details>
      )}
    </section>
  );
}
export function PilotPanel({ pilot }: { pilot?: PilotStatus }) {
  if (!pilot) return null;
  return (
    <section className="editor-section pilot-panel">
      <div className="eyebrow">CONNECTED SERVICES & PILOT USAGE</div>
      <div className="section-title">
        <h2>API pilot</h2>
        <span className="badge">
          {pilot.enabled ? "Live calls enabled" : "Live calls disabled"}
        </span>
      </div>
      <div className="provider-status">
        {(["claude", "gemini", "assemblyai"] as const).map((provider) => (
          <div key={provider}>
            <strong>
              {
                {
                  claude: "Claude",
                  gemini: "Google / Gemini",
                  assemblyai: "AssemblyAI",
                }[provider]
              }
            </strong>
            <span>
              {pilot.providers[provider] ? (
                <Check size={13} />
              ) : (
                <AlertCircle size={13} />
              )}{" "}
              {pilot.events.some(
                (event) =>
                  event.provider === provider && event.state === "succeeded",
              )
                ? "Pilot call succeeded"
                : pilot.providers[provider]
                  ? "Key configured"
                  : "Key missing"}
            </span>
          </div>
        ))}
      </div>
      <div className="pilot-totals">
        <div>
          <small>COMBINED PILOT CEILING</small>
          <strong>US${pilot.limitUsd.toFixed(2)}</strong>
        </div>
        <div>
          <small>RESERVED</small>
          <strong>US${pilot.reservedUsd.toFixed(2)}</strong>
        </div>
        <div>
          <small>AVAILABLE TO RESERVE</small>
          <strong>US${pilot.remainingUsd.toFixed(2)}</strong>
        </div>
      </div>
      <p className="hint">
        <ShieldCheck size={14} />
        Reservations are conservative usage allowances, not invoices. They count
        credit usage and stay held after failure or timeout. The total persists
        across restarts. Hosting is excluded.
      </p>
      <div className="usage-events">
        {pilot.events.slice(0, 12).map((event) => (
          <div className="usage-event" key={event.id}>
            <div>
              <strong>
                {event.provider} / {event.operation}
              </strong>
              <small>
                {new Date(event.createdAt).toLocaleString()}{" "}
                {event.providerId ? "· provider record saved" : ""}
              </small>
              {event.note && <p>{event.note}</p>}
            </div>
            <span className="badge">{event.state}</span>
            <span>US${event.reservedUsd.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <p className="provider-note">
        Research model: {pilot.models.claude} · Narration model:{" "}
        {pilot.models.gemini} · Captions: {pilot.captions}
      </p>
    </section>
  );
}
