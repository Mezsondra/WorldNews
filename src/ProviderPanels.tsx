import { useEffect, useState } from "react";
import {
  Sparkles,
  Search,
  FileText,
  ShieldCheck,
  AlertCircle,
  Check,
  Loader2,
  Clapperboard,
} from "lucide-react";
import type {
  AIReport,
  PilotStatus,
  ResearchRun,
  Story,
} from "../shared/types";
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
export function AutomationPanel({
  story,
  disabled,
  act,
}: {
  story: Story;
  disabled: boolean;
  act: Act;
}) {
  const flow = story.automation;
  const active =
    !!flow && ["waiting-research", "queued", "rendering"].includes(flow.state);
  return (
    <section className="editor-section">
      <div className="section-title">
        <h2>Automatic production</h2>
        <Clapperboard size={18} />
      </div>
      <p className="hint">
        Research → source-linked script → related archive photos → narrated
        private video. Local narration and estimated captions use no extra API
        credit.
      </p>
      {flow && (
        <p role="status">
          <strong>{flow.message}</strong>
        </p>
      )}
      <button
        className="button primary"
        disabled={
          disabled ||
          active ||
          story.renders.some((r) => r.version === story.version) ||
          ["held", "rejected", "approved"].includes(story.stage)
        }
        onClick={() =>
          void act(
            () =>
              call(`/stories/${story.id}/automate`, { version: story.version }),
            "Automatic production enabled. The video will appear in Preview.",
          )
        }
      >
        {active ? (
          <Loader2 className="spin" size={15} />
        ) : (
          <Clapperboard size={15} />
        )}
        {active
          ? "Working automatically"
          : flow?.state === "ready"
            ? "Video ready in Preview"
            : "Make video automatically"}
      </button>
      <p className="provider-note">
        Only claims passing the evidence checks enter narration. Unresolved
        claims stay in the dossier. Brief previews can be shorter than a minute;
        publication requires review and a final render.
      </p>
      {flow?.warnings.map((warning, i) => (
        <p className="hint" key={i}>
          {warning}
        </p>
      ))}
    </section>
  );
}
export function AssistantPanel({
  story,
  pilot,
  disabled,
  act,
  runs = [],
}: {
  story: Story;
  pilot?: PilotStatus;
  disabled: boolean;
  act: Act;
  runs?: ResearchRun[];
}) {
  const [reports, setReports] = useState<AIReport[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [reportId, setReportId] = useState("");
  useEffect(() => {
    void call(`/stories/${story.id}/ai-reports`)
      .then(setReports)
      .catch(() => {});
  }, [story.id, story.version, refresh, runs[0]?.status]);
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
  const researching = runs.some((r) =>
    ["queued", "running"].includes(r.status),
  );
  const label = (kind: AIReport["kind"]) =>
    kind === "visuals"
      ? "Visual research"
      : kind === "verification"
        ? "Web research & evidence check"
        : kind === "research"
          ? "Attached source analysis"
          : "Draft result";
  return (
    <section className="editor-section assistant-panel">
      <div className="section-title">
        <h2>Editorial assistant</h2>
        <Sparkles size={18} />
      </div>
      <p className="hint">
        Analyze saved snapshots or draft narration below. Use the research bot
        above to find sources and check evidence on the web. Findings need
        editorial review.
      </p>
      <div className="assistant-actions">
        <button
          className="button"
          disabled={
            disabled ||
            researching ||
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
            researching ||
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
                {label(report.kind)} · v{report.version} ·{" "}
                {new Date(report.createdAt).toLocaleTimeString()}
              </option>
            ))}
          </select>
        </label>
      )}
      {latest && (
        <details className="ai-report" key={latest.id} open>
          <summary>
            {label(latest.kind)} · v{latest.version}
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
export function ResearchBotPanel({
  story,
  pilot,
  runs,
  disabled,
  act,
}: {
  story: Story;
  pilot?: PilotStatus;
  runs: ResearchRun[];
  disabled: boolean;
  act: Act;
}) {
  const run = runs[0];
  const active = runs.some((r) => ["queued", "running"].includes(r.status));
  const attempted = pilot?.events.some(
    (e) =>
      e.operationKey === `${story.id}:${story.version}:claude:web-research`,
  );
  const recoveryChoices = [
    {
      provider: "claude" as const,
      label: "Claude",
      allowance: 0.5,
      operation: "web-verify-saved",
    },
    {
      provider: "gemini" as const,
      label: "Google",
      allowance: 0.15,
      operation: `web-verify-saved:${pilot?.models.verification}:passage-refs-v2`,
    },
  ];
  return (
    <section className="editor-section research-bot-panel">
      <div className="section-title">
        <h2>Research bot</h2>
        <Search size={18} />
      </div>
      <p className="hint">
        Find original documents, independent reporting and relevant public
        responses. Check claims against retrieved pages and preserve supporting
        and contradicting passages.
      </p>
      <button
        className="button primary"
        disabled={
          disabled ||
          active ||
          !pilot?.enabled ||
          !pilot.providers.claude ||
          pilot.remainingUsd < 1 ||
          attempted ||
          ["held", "rejected", "approved"].includes(story.stage)
        }
        onClick={() =>
          void act(
            () =>
              call(`/stories/${story.id}/research`, { version: story.version }),
            "Research queued. Progress and findings will appear here.",
          )
        }
      >
        {active ? <Loader2 className="spin" size={15} /> : <Search size={15} />}
        {active ? "Research in progress" : "Find sources & verify"}
      </button>
      <p className="provider-note">
        US$1.00 reserved for up to four searches and one evidence check. No
        automatic paid retries. Findings remain unreviewed.
      </p>
      {run?.status === "failed" &&
        run.version === story.version &&
        run.candidates.some((c) => c.status === "retrieved") &&
        recoveryChoices
          .filter(
            (choice) =>
              !pilot?.events.some(
                (e) =>
                  e.operationKey ===
                  `${story.id}:${story.version}:${choice.provider}:${choice.operation}`,
              ),
          )
          .map((choice) => (
            <button
              key={choice.provider}
              className="button"
              disabled={
                disabled ||
                active ||
                !pilot?.enabled ||
                !pilot.providers[choice.provider] ||
                pilot.remainingUsd < choice.allowance ||
                ["held", "rejected", "approved"].includes(story.stage)
              }
              onClick={() =>
                void act(
                  () =>
                    call(`/stories/${story.id}/research`, {
                      version: story.version,
                      resumeRunId: run.id,
                      verificationProvider: choice.provider,
                    }),
                  "Saved sources queued for verification. No new web search will be sent.",
                )
              }
            >
              Verify saved sources · {choice.label} · US$
              {choice.allowance.toFixed(2)}
            </button>
          ))}
      {pilot && pilot.remainingUsd < 1 && !active && (
        <p className="hint">
          New web research needs US$1.00 available; US$
          {pilot.remainingUsd.toFixed(2)} remains in this pilot.
        </p>
      )}
      {run && (
        <div className="research-run" aria-live="polite">
          <p>
            <strong>{run.progress}</strong>
          </p>
          <small>
            Started {new Date(run.createdAt).toLocaleString()} · v{run.version}
            {run.resultVersion ? ` → v${run.resultVersion}` : ""}
            {run.verificationProvider
              ? ` · ${run.verificationProvider === "gemini" ? "Google" : "Claude"} evidence check`
              : ""}
          </small>
          {run.error && <p className="render-error">{run.error}</p>}
          {run.warnings.map((warning, i) => (
            <p className="hint" key={i}>
              {warning}
            </p>
          ))}
          {run.status === "succeeded" && (
            <p className="hint">
              Read the saved evidence report below and inspect the claims and
              sources in the dossier. Source classifications and translations
              are provisional.
            </p>
          )}
          {run.status === "succeeded" &&
            !story.sources.some((s) => s.kind === "primary") && (
              <p className="hint">
                No primary document or original statement is attached yet. Legal
                conclusions and underlying allegations still need original
                evidence.
              </p>
            )}
          {!!run.queries.length && (
            <details>
              <summary>Searches performed ({run.queries.length})</summary>
              <ul>
                {run.queries.map((query, i) => (
                  <li key={i}>{query}</li>
                ))}
              </ul>
            </details>
          )}
          {!!run.candidates.length && (
            <details>
              <summary>Source leads ({run.candidates.length})</summary>
              <ul>
                {run.candidates.map((candidate) => (
                  <li key={candidate.url}>
                    <a href={candidate.url} target="_blank" rel="noreferrer">
                      {candidate.title}
                    </a>
                    <small>
                      {candidate.status}{" "}
                      {candidate.note ? `· ${candidate.note}` : ""}
                    </small>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {run.candidates.some((c) => c.status === "retrieved") && (
            <p>
              <a
                href={`/api/stories/${story.id}/research/${run.id}/sources`}
                target="_blank"
                rel="noreferrer"
              >
                Saved research snapshots
              </a>
            </p>
          )}
        </div>
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
          <small>COUNTED</small>
          <strong>US${pilot.reservedUsd.toFixed(2)}</strong>
        </div>
        <div>
          <small>AVAILABLE TO RESERVE</small>
          <strong>US${pilot.remainingUsd.toFixed(2)}</strong>
        </div>
      </div>
      <p className="hint">
        <ShieldCheck size={14} />
        Each call reserves an allowance first. When it finishes, its cost is
        estimated from recorded tokens at list prices and the unused part is
        released. Uncertain or interrupted calls keep their full reservation.
        Estimates are not invoices; check provider billing. The total persists
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
            <span title={`Reserved US$${event.reservedUsd.toFixed(2)}`}>
              {event.actualUsd !== undefined
                ? `US$${event.actualUsd.toFixed(3)}`
                : `US$${event.reservedUsd.toFixed(2)} held`}
            </span>
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
