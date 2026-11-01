import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Globe2,
  Layers3,
  Search,
  Clapperboard,
  Send,
  Settings2,
  History,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Pause,
  Play,
  Check,
  CheckCheck,
  Link2,
  FileText,
  AlertCircle,
  X,
  Loader2,
  Download,
  ChevronDown,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  ImagePlus,
  Save,
  Radio,
  BookOpen,
} from "lucide-react";
import type { Overview, Story, Claim, Source, Segment } from "../shared/types";
import "./styles.css";
import {
  AssistantPanel,
  PilotPanel,
  ResearchBotPanel,
  AutomationPanel,
} from "./ProviderPanels";
type Page =
  | "Stories"
  | "Research"
  | "Preview"
  | "Publishing"
  | "Corrections"
  | "Settings";
const pages: [Page, typeof Globe2][] = [
  ["Stories", Layers3],
  ["Research", Search],
  ["Preview", Clapperboard],
  ["Publishing", Send],
  ["Corrections", History],
  ["Settings", Settings2],
];
async function api<T = any>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
const media = (file: string) => "/media/" + file;
const date = (s: string) =>
  s
    ? new Date(s).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date pending";
const uid = () => crypto.randomUUID();
const status = (s: string) => s.replaceAll("-", " ");
function App() {
  const [overview, setOverview] = useState<Overview>();
  const [page, setPage] = useState<Page>("Stories");
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<Story>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All stories");
  const [preview, setPreview] = useState("Card");
  const story =
    overview?.stories.find((s) => s.id === selected) || overview?.stories[0];
  const render = story?.renders.find((r) => r.version === story.version);
  const job = overview?.jobs.find(
    (j) =>
      j.storyId === story?.id &&
      j.version === story?.version &&
      ["running", "queued"].includes(j.status),
  );
  const lastJob = overview?.jobs
    .filter((j) => j.storyId === story?.id && j.version === story?.version)
    .at(-1);
  const editable = (s: Story) => ({
    title: s.title,
    summary: s.summary,
    category: s.category,
    region: s.region,
    eventAt: s.eventAt,
    claims: s.claims.map(({ reviewed, ...c }) => c),
    segments: s.segments,
    pronunciations: s.pronunciations,
  });
  const dirty = !!(
    story &&
    draft &&
    JSON.stringify(editable(draft)) !== JSON.stringify(editable(story))
  );
  async function refresh() {
    const data = await api<Overview>("/overview");
    setOverview(data);
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => void refresh().catch(() => {}), 3000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (story) setDraft(structuredClone(story));
  }, [story?.id, story?.version]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [page]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!newOpen) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setNewOpen(false);
      if (event.key === "Tab") {
        const items = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".modal button:not(:disabled),.modal input:not(:disabled),.modal textarea:not(:disabled),.modal select:not(:disabled)",
          ),
        );
        if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault();
          items.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
          event.preventDefault();
          items[0]?.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [newOpen, busy]);
  async function act(fn: () => Promise<unknown>, message?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      if (message) setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!draft) return;
    await act(async () => {
      const result = await api<Story>(`/stories/${draft.id}`, "PUT", {
        version: draft.version,
        title: draft.title,
        summary: draft.summary,
        category: draft.category,
        region: draft.region,
        eventAt: draft.eventAt,
        claims: draft.claims,
        segments: draft.segments,
        pronunciations: draft.pronunciations,
      });
      setDraft(result);
    }, "Revision saved. Check the evidence again before rendering.");
  }
  function go(next: Page) {
    if (dirty) {
      setError("Save your changes before leaving this workspace.");
      return;
    }
    setPage(next);
  }
  function choose(s: Story, next?: Page) {
    if (dirty) {
      setError("Save your changes before selecting another story.");
      return;
    }
    setSelected(s.id);
    if (next) setPage(next);
  }
  const update = (fields: Partial<Story>) =>
    setDraft((d) => (d ? { ...d, ...fields } : d));
  const claimUpdate = (id: string, fields: Partial<Claim>) =>
    update({
      claims: draft!.claims.map((c) => (c.id === id ? { ...c, ...fields } : c)),
    });
  const segmentUpdate = (id: string, fields: Partial<Segment>) =>
    update({
      segments: draft!.segments.map((s) =>
        s.id === id ? { ...s, ...fields } : s,
      ),
    });
  const currentGates = story ? overview?.gates[story.id] || [] : [];
  const storyStatus = (s: Story) => {
    if (s.stage !== "researching") return status(s.stage);
    const run = overview?.researchRuns?.find((r) => r.storyId === s.id);
    return run?.status === "running"
      ? "Research running"
      : run?.status === "queued"
        ? "Research queued"
        : run?.status === "succeeded"
          ? "Evidence review"
          : run?.status === "failed"
            ? "Research needs attention"
            : "Needs research";
  };
  const ready =
    overview?.stories.filter((s) => s.stage === "awaiting-review").length || 0;
  function card(s: Story, small = false) {
    const r = s.renders.find((r) => r.version === s.version);
    return r ? (
      <img
        className="export-card"
        src={media(r.card)}
        alt={`Breaking card: ${s.title}`}
      />
    ) : (
      <div className={"news-art " + (small ? "small" : "")}>
        <div className="art-mast">
          WORLD NEWS{" "}
          <span>{s.demo ? "ARCHIVE / DEMO" : "EDITORIAL DRAFT"}</span>
        </div>
        <div className="art-rule" />
        <div className="art-category">
          {s.category} / {s.eventAt ? date(s.eventAt) : "Event date pending"}
        </div>
        <h3>{s.title}</h3>
        <div className="art-line" />
        <p>
          {s.summary || "A source-linked story, prepared for editorial review."}
        </p>
        <div className="art-footer">
          {s.sources
            .map((s) => s.publisher)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(" · ") || "Sources pending"}
          <span>
            {s.demo
              ? "Historical sample · not current news"
              : "Draft · approval required"}
          </span>
        </div>
        <div className="orbital" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          aria-label="World News editorial desk"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("Stories");
          }}
        >
          <Globe2 size={31} strokeWidth={1.3} />
          <span>
            WORLD
            <br />
            <b>NEWS</b>
          </span>
        </a>
        <div className="edition">
          EDITORIAL WORKSPACE <span>01</span>
        </div>
        <nav>
          {pages.map(([label, Icon]) => (
            <button
              key={label}
              onClick={() => go(label)}
              className={page === label ? "nav active" : "nav"}
              aria-current={page === label ? "page" : undefined}
            >
              <Icon size={18} />
              {label}
              {label === "Stories" && (
                <span className="nav-count">
                  {overview?.stories.length || 0}
                </span>
              )}
              {label === "Preview" && ready > 0 && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mode">
            <span className="live-dot" />
            LOCAL DEVELOPMENT
          </div>
          <p>
            Every story starts with evidence.
            <br />
            Every export needs your review.
          </p>
          <div className="profile">
            <span>ED</span>
            <div>
              <strong>Editorial desk</strong>
              <small>Private workspace</small>
            </div>
            <Settings2 size={15} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <span>/</span> <strong>{page}</strong>
          </div>
          <div className="top-actions">
            <span className="local-label">
              <span className="live-dot" /> Export-only mode
            </span>
            <button
              className={
                "pause-button " + (overview?.settings.paused ? "paused" : "")
              }
              onClick={() =>
                void act(() =>
                  api("/settings", "POST", {
                    paused: !overview?.settings.paused,
                  }),
                )
              }
            >
              {overview?.settings.paused ? (
                <Pause size={14} />
              ) : (
                <Play size={14} />
              )}{" "}
              {overview?.settings.paused
                ? "Publishing paused"
                : "Publishing unpaused"}
            </button>
          </div>
        </header>
        <main key={page} className="page-enter">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "Stories"
                  ? "YOUR NEWSROOM, AT A GLANCE"
                  : "EDITORIAL WORKSPACE"}
              </div>
              <h1>
                {page === "Stories"
                  ? "The editorial desk."
                  : page === "Research"
                    ? "Follow the evidence."
                    : page === "Preview"
                      ? "The production studio."
                      : page === "Publishing"
                        ? "Review before release."
                        : page === "Corrections"
                          ? "Keep the record clear."
                          : "Workspace settings."}
              </h1>
              <p>
                {page === "Stories"
                  ? "Find the story. Check the facts. Make it worth sharing."
                  : page === "Research"
                    ? "Trace every claim to its source, then check what the narration actually says."
                    : page === "Preview"
                      ? "One script, matching citations, and a clean master for every destination."
                      : page === "Publishing"
                        ? "Approve an exact version after checking the media and its evidence."
                        : page === "Corrections"
                          ? "Keep a visible history of changes, context, and corrections."
                          : "Local development is ready. Production services need configuration."}
              </p>
            </div>
            <button
              className="button primary"
              onClick={() =>
                dirty
                  ? setError("Save your changes before opening another story.")
                  : setNewOpen(true)
              }
            >
              <Plus size={17} />
              New story
            </button>
          </div>
          {error && (
            <div role="alert" className="alert error">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={17} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert success">
              <Check size={18} />
              {notice}
            </div>
          )}
          {!overview ? (
            <div className="loading">
              <Loader2 className="spin" />
              Opening the desk…
            </div>
          ) : (
            <>
              {page === "Stories" && (
                <>
                  <div className="desk-stats">
                    <div>
                      <span>IN THE QUEUE</span>
                      <strong>
                        {String(
                          overview.stories.filter((s) => s.stage !== "rejected")
                            .length,
                        ).padStart(2, "0")}
                        <small>stories to develop</small>
                      </strong>
                    </div>
                    <div>
                      <span>READY FOR REVIEW</span>
                      <strong>
                        {String(ready).padStart(2, "0")}
                        <small>awaiting your decision</small>
                      </strong>
                    </div>
                    <div>
                      <span>PUBLICATION</span>
                      <strong className="stat-text">
                        {overview.settings.paused ? "Paused" : "Export only"}
                        <small>No accounts connected</small>
                      </strong>
                    </div>
                    <div className="desk-note">
                      <ShieldCheck size={25} />
                      <p>
                        Editorial control is on.
                        <br />
                        <strong>Nothing posts automatically.</strong>
                      </p>
                    </div>
                  </div>
                  <div className="stories-layout">
                    <section className="queue">
                      <div className="section-title">
                        <h2>
                          Story queue <span>{overview.stories.length}</span>
                        </h2>
                        <button
                          className="text-button"
                          onClick={() => void act(refresh)}
                          aria-label="Refresh queue"
                        >
                          <RefreshCw size={15} />
                        </button>
                      </div>
                      <div className="queue-tools">
                        <div className="search">
                          <Search size={16} />
                          <input
                            aria-label="Search stories"
                            placeholder="Search the desk…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                          />
                        </div>
                        <select
                          aria-label="Filter stories"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        >
                          <option>All stories</option>
                          <option>Needs evidence</option>
                          <option>Ready for review</option>
                          <option>Approved</option>
                          <option>Held</option>
                        </select>
                      </div>
                      <div className="table-label">
                        <span>STORY / DEVELOPMENT</span>
                        <span>STATUS</span>
                      </div>
                      {overview.stories
                        .filter((s) =>
                          s.title.toLowerCase().includes(query.toLowerCase()),
                        )
                        .filter(
                          (s) =>
                            filter === "All stories" ||
                            (filter === "Needs evidence" &&
                              (overview.gates[s.id]?.length || 0) > 0) ||
                            (filter === "Ready for review" &&
                              s.stage === "awaiting-review") ||
                            (filter === "Approved" && s.stage === "approved") ||
                            (filter === "Held" && s.stage === "held"),
                        )
                        .map((s) => (
                          <button
                            key={s.id}
                            className={
                              "story-row " +
                              (s.id === story?.id ? "selected" : "")
                            }
                            onClick={() => choose(s)}
                          >
                            <div className="story-index">
                              {s.category.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="story-content">
                              <div className="row-kicker">
                                {s.category} <span>·</span> {s.region}{" "}
                                {s.demo && (
                                  <em>{s.pilot ? "API PILOT" : "DEMO"}</em>
                                )}
                              </div>
                              <h3>{s.title}</h3>
                              <p>
                                {s.sources.length} sources <span>·</span>{" "}
                                {s.claims.filter((c) => c.reviewed).length}/
                                {s.claims.length} claims checked <span>·</span>{" "}
                                v{s.version}
                              </p>
                            </div>
                            <span className={"badge " + s.stage}>
                              {storyStatus(s)}
                            </span>
                            <ArrowUpRight className="row-arrow" size={18} />
                          </button>
                        ))}
                      {!overview.stories.length && (
                        <div className="empty">
                          <BookOpen size={30} />
                          <h3>Your first story starts here.</h3>
                          <p>
                            Add a source URL or a topic to open a research
                            dossier.
                          </p>
                          <button
                            className="button"
                            onClick={() => setNewOpen(true)}
                          >
                            Add a story <ArrowRight size={16} />
                          </button>
                        </div>
                      )}
                      <div className="queue-foot">
                        <span>
                          <Radio size={13} /> Manual discovery
                        </span>
                        <span>Feed polling is a later milestone</span>
                      </div>
                      <div className="editor-note">
                        <div className="eyebrow">DESK NOTE</div>
                        <h3>A source is a starting point.</h3>
                        <p>
                          Check the original. Separate a statement from an
                          established fact. Keep uncertainty in the story.
                        </p>
                        <button
                          className="text-button"
                          disabled={!story}
                          onClick={() => go("Research")}
                        >
                          Open research <ArrowRight size={15} />
                        </button>
                      </div>
                    </section>
                    <aside className="focus">
                      <div className="section-title">
                        <h2>On the desk</h2>
                        <span className="eyebrow">
                          {story ? "SELECTED STORY" : "NO STORY SELECTED"}
                        </span>
                      </div>
                      {story ? (
                        <>
                          {card(story)}
                          <div className="focus-details">
                            <span className="eyebrow">
                              {story.demo
                                ? "HISTORICAL WORKFLOW SAMPLE"
                                : "IN DEVELOPMENT"}
                            </span>
                            <p>
                              {currentGates.length
                                ? `${currentGates.length} editorial checks need attention before approval.`
                                : "Evidence checks complete. Continue to production and visual review."}
                            </p>
                            <button
                              className="button full"
                              onClick={() => go("Research")}
                            >
                              Continue story <ArrowRight size={17} />
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="empty">
                          Select a story to see its preview.
                        </div>
                      )}
                    </aside>
                  </div>
                </>
              )}
              {page !== "Stories" && page !== "Settings" && (
                <div className="story-switch">
                  <span>WORKING STORY</span>
                  <select
                    aria-label="Working story"
                    value={story?.id || ""}
                    onChange={(e) =>
                      choose(
                        overview.stories.find((s) => s.id === e.target.value)!,
                      )
                    }
                  >
                    {overview.stories.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.pilot ? "[API pilot] " : s.demo ? "[Demo] " : ""}
                        {s.title}
                      </option>
                    ))}
                  </select>
                  {story && (
                    <>
                      <span className="version">v{story.version}</span>
                      <span className={"badge " + story.stage}>
                        {storyStatus(story)}
                      </span>
                    </>
                  )}
                </div>
              )}
              {page === "Research" && story && draft && (
                <>
                  <div className="workspace-toolbar">
                    <div className="section-title">
                      <h2>Research dossier</h2>
                      <span>
                        {story.sources.length} sources ·{" "}
                        {new Set(story.sources.map((s) => s.lineage)).size}{" "}
                        source lineages
                      </span>
                    </div>
                    <button
                      className="button primary"
                      disabled={busy || !dirty}
                      onClick={() => void save()}
                    >
                      <Save size={16} />
                      {dirty ? "Save revision" : "Revision saved"}
                    </button>
                  </div>
                  <div className="research-grid">
                    <div>
                      <section className="editor-section">
                        <h2>Story details</h2>
                        <label>
                          Headline
                          <input
                            value={draft.title}
                            maxLength={140}
                            onChange={(e) => update({ title: e.target.value })}
                          />
                        </label>
                        <label>
                          Card summary
                          <textarea
                            rows={3}
                            value={draft.summary}
                            maxLength={220}
                            onChange={(e) =>
                              update({ summary: e.target.value })
                            }
                          />
                        </label>
                        <div className="two-fields">
                          <label>
                            Event date & time
                            <input
                              type="datetime-local"
                              value={
                                draft.eventAt ? draft.eventAt.slice(0, 16) : ""
                              }
                              onChange={(e) =>
                                update({
                                  eventAt: e.target.value
                                    ? new Date(
                                        e.target.value + "Z",
                                      ).toISOString()
                                    : "",
                                })
                              }
                            />
                            <small>UTC · when the event happened</small>
                          </label>
                          <label>
                            Category
                            <input
                              value={draft.category}
                              onChange={(e) =>
                                update({ category: e.target.value })
                              }
                            />
                          </label>
                        </div>
                        <label>
                          Region
                          <input
                            value={draft.region}
                            onChange={(e) => update({ region: e.target.value })}
                          />
                        </label>
                      </section>
                      <section className="editor-section">
                        <div className="section-title">
                          <h2>Claims & narration</h2>
                          <button
                            className="text-button"
                            disabled={draft.claims.length >= 20}
                            onClick={() => {
                              const cid = "C" + uid().slice(0, 6);
                              update({
                                claims: [
                                  ...draft.claims,
                                  {
                                    id: cid,
                                    text: "",
                                    status: "insufficient evidence",
                                    reviewed: false,
                                    evidence: [],
                                  },
                                ],
                                segments: [
                                  ...draft.segments,
                                  { id: uid(), text: "", claimIds: [cid] },
                                ],
                              });
                            }}
                          >
                            <Plus size={16} />
                            Add claim
                          </button>
                        </div>
                        <p className="hint">
                          Save edits first, then check each claim against its
                          passages. A model confidence score cannot clear a
                          claim.
                        </p>
                        {draft.claims.map((c, index) => {
                          const live = story.claims.find((l) => l.id === c.id);
                          return (
                            <article className="claim-editor" key={c.id}>
                              <div className="claim-heading">
                                <span className="claim-num">
                                  {String(index + 1).padStart(2, "0")}
                                </span>
                                <strong>{c.id}</strong>
                                <button
                                  className="icon-button"
                                  aria-label={`Remove claim ${c.id}`}
                                  onClick={() =>
                                    update({
                                      claims: draft.claims.filter(
                                        (x) => x.id !== c.id,
                                      ),
                                      segments: draft.segments.filter(
                                        (s) => !s.claimIds.includes(c.id),
                                      ),
                                    })
                                  }
                                >
                                  <X size={15} />
                                </button>
                              </div>
                              <label>
                                Factual claim
                                <textarea
                                  rows={3}
                                  value={c.text}
                                  onChange={(e) =>
                                    claimUpdate(c.id, { text: e.target.value })
                                  }
                                />
                              </label>
                              <label>
                                Evidence status
                                <select
                                  value={c.status}
                                  onChange={(e) =>
                                    claimUpdate(c.id, {
                                      status: e.target.value as Claim["status"],
                                    })
                                  }
                                >
                                  {[
                                    "supported fact",
                                    "attributed statement",
                                    "allegation",
                                    "analysis",
                                    "disputed",
                                    "insufficient evidence",
                                  ].map((s) => (
                                    <option key={s}>{s}</option>
                                  ))}
                                </select>
                              </label>
                              {c.evidence.map((ev, i) => (
                                <div className="evidence-edit" key={i}>
                                  <div className="two-fields">
                                    <label>
                                      Source
                                      <select
                                        aria-label={`Source for ${c.id} evidence ${i + 1}`}
                                        value={ev.sourceId}
                                        onChange={(e) =>
                                          claimUpdate(c.id, {
                                            evidence: c.evidence.map((x, j) =>
                                              j === i
                                                ? {
                                                    ...x,
                                                    sourceId: e.target.value,
                                                  }
                                                : x,
                                            ),
                                          })
                                        }
                                      >
                                        {draft.sources.map((s) => (
                                          <option key={s.id} value={s.id}>
                                            {s.publisher} —{" "}
                                            {s.title.slice(0, 35)}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      Relationship
                                      <select
                                        value={ev.relation}
                                        onChange={(e) =>
                                          claimUpdate(c.id, {
                                            evidence: c.evidence.map((x, j) =>
                                              j === i
                                                ? {
                                                    ...x,
                                                    relation: e.target.value as
                                                      | "supports"
                                                      | "contradicts",
                                                  }
                                                : x,
                                            ),
                                          })
                                        }
                                      >
                                        <option>supports</option>
                                        <option>contradicts</option>
                                      </select>
                                    </label>
                                  </div>
                                  <label>
                                    Exact source passage
                                    <textarea
                                      rows={3}
                                      value={ev.passage}
                                      onChange={(e) =>
                                        claimUpdate(c.id, {
                                          evidence: c.evidence.map((x, j) =>
                                            j === i
                                              ? {
                                                  ...x,
                                                  passage: e.target.value,
                                                }
                                              : x,
                                          ),
                                        })
                                      }
                                    />
                                  </label>
                                  {draft.sources.find(
                                    (s) => s.id === ev.sourceId,
                                  )?.language !== "en" && (
                                    <label>
                                      Reviewed English translation
                                      <textarea
                                        value={ev.translation || ""}
                                        onChange={(e) =>
                                          claimUpdate(c.id, {
                                            evidence: c.evidence.map((x, j) =>
                                              j === i
                                                ? {
                                                    ...x,
                                                    translation: e.target.value,
                                                  }
                                                : x,
                                            ),
                                          })
                                        }
                                      />
                                    </label>
                                  )}
                                  <button
                                    className="text-button muted"
                                    onClick={() =>
                                      claimUpdate(c.id, {
                                        evidence: c.evidence.filter(
                                          (_, j) => j !== i,
                                        ),
                                      })
                                    }
                                  >
                                    Remove passage
                                  </button>
                                </div>
                              ))}
                              <button
                                className="text-button"
                                disabled={!draft.sources.length}
                                onClick={() =>
                                  claimUpdate(c.id, {
                                    evidence: [
                                      ...c.evidence,
                                      {
                                        sourceId: draft.sources[0].id,
                                        passage: "",
                                        relation: "supports",
                                      },
                                    ],
                                  })
                                }
                              >
                                <Link2 size={14} />
                                Link a source passage
                              </button>
                              {draft.segments
                                .filter((s) => s.claimIds.includes(c.id))
                                .map((s) => (
                                  <div key={s.id}>
                                    <label>
                                      Narration segment
                                      <textarea
                                        rows={4}
                                        value={s.text}
                                        maxLength={900}
                                        onChange={(e) =>
                                          segmentUpdate(s.id, {
                                            text: e.target.value,
                                          })
                                        }
                                      />
                                    </label>
                                    <label>
                                      Scene visual
                                      <select
                                        value={s.assetId || ""}
                                        onChange={(e) =>
                                          segmentUpdate(s.id, {
                                            assetId:
                                              e.target.value || undefined,
                                          })
                                        }
                                      >
                                        <option value="">
                                          Text card · no external media
                                        </option>
                                        {draft.assets.map((a) => (
                                          <option key={a.id} value={a.id}>
                                            {a.creator} — {a.context}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                ))}
                              <label className="review-check">
                                <input
                                  type="checkbox"
                                  checked={!!live?.reviewed && !dirty}
                                  disabled={
                                    busy ||
                                    dirty ||
                                    !live ||
                                    !!story.approval ||
                                    !!job
                                  }
                                  onChange={(e) =>
                                    void act(() =>
                                      api(
                                        `/stories/${story.id}/review`,
                                        "POST",
                                        {
                                          version: story.version,
                                          claimId: c.id,
                                          reviewed: e.target.checked,
                                        },
                                      ),
                                    )
                                  }
                                />
                                <span>
                                  I checked the claim, narration, figures, and
                                  attribution against this evidence.
                                </span>
                              </label>
                            </article>
                          );
                        })}
                      </section>
                    </div>
                    <aside className="research-inspector">
                      <AutomationPanel
                        story={story}
                        disabled={busy || dirty || !!job}
                        act={act}
                      />
                      <ResearchBotPanel
                        story={story}
                        pilot={overview.pilot}
                        runs={(overview.researchRuns || []).filter(
                          (r) => r.storyId === story.id,
                        )}
                        disabled={busy || dirty || !!job}
                        act={act}
                      />
                      <AssistantPanel
                        story={story}
                        pilot={overview.pilot}
                        disabled={busy || dirty || !!job}
                        act={act}
                        runs={(overview.researchRuns || []).filter(
                          (r) => r.storyId === story.id,
                        )}
                      />
                      <SourcePanel
                        story={story}
                        disabled={busy || dirty || !!job}
                        act={act}
                      />
                      <section className="editor-section gate-list">
                        <h2>Editorial checks</h2>
                        {dirty ? (
                          <p>Save this revision to run the checks.</p>
                        ) : currentGates.length ? (
                          currentGates.map((g, i) => (
                            <p key={i}>
                              <AlertCircle size={15} />
                              {g.message}
                            </p>
                          ))
                        ) : (
                          <p>
                            <CheckCheck size={18} />
                            All structural checks passed. Media and factual
                            judgment still need your review.
                          </p>
                        )}
                        <button
                          className="button full"
                          disabled={dirty}
                          onClick={() => go("Preview")}
                        >
                          Open production studio <ArrowRight size={16} />
                        </button>
                      </section>
                      <button
                        className="text-button"
                        disabled={busy || dirty}
                        onClick={() =>
                          void act(
                            () =>
                              api(`/stories/${story.id}/stage`, "POST", {
                                version: story.version,
                                stage: ["held", "rejected"].includes(
                                  story.stage,
                                )
                                  ? "researching"
                                  : "held",
                              }),
                            ["held", "rejected"].includes(story.stage)
                              ? "Research resumed. Recheck the evidence before production."
                              : "Story held. Approval was invalidated.",
                          )
                        }
                      >
                        {["held", "rejected"].includes(story.stage) ? (
                          <Play size={14} />
                        ) : (
                          <Pause size={14} />
                        )}
                        {["held", "rejected"].includes(story.stage)
                          ? "Resume research"
                          : "Hold this story"}
                      </button>
                    </aside>
                  </div>
                </>
              )}
              {page === "Preview" && story && draft && (
                <div className="studio-layout">
                  <section>
                    <div className="workspace-toolbar">
                      <h2>Output preview</h2>
                      <div className="segmented">
                        {["Card", "Story", "Video"].map((t) => (
                          <button
                            key={t}
                            className={preview === t ? "chosen" : ""}
                            onClick={() => setPreview(t)}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div
                      className={
                        "preview-stage " +
                        (preview === "Card" ? "" : "vertical")
                      }
                    >
                      <div className="preview-media">
                        {preview === "Video" && render ? (
                          <video
                            controls
                            preload="metadata"
                            poster={media(render.story)}
                            src={media(render.video)}
                          >
                            <track
                              kind="captions"
                              srcLang="en"
                              label="English"
                              src={media(render.captions)}
                              default
                            />
                          </video>
                        ) : render ? (
                          <img
                            src={media(
                              preview === "Card" ? render.card : render.story,
                            )}
                            alt={`${preview} export preview`}
                          />
                        ) : (
                          card(story)
                        )}
                      </div>
                    </div>
                    <div className="preview-caption">
                      <span>
                        {preview === "Card"
                          ? "1080 × 1350 · Feed card"
                          : "1080 × 1920 · Vertical master"}
                      </span>
                      <span>
                        {render
                          ? `${render.duration.toFixed(1)} sec · v${render.version}`
                          : "Preview layout · render to export"}
                      </span>
                    </div>
                    {render && (
                      <div className="download-row">
                        <a
                          className="button"
                          download
                          href={media(render.card)}
                        >
                          <Download size={15} />
                          Card
                        </a>
                        <a
                          className="button"
                          download
                          href={media(render.video)}
                        >
                          <Download size={15} />
                          Video
                        </a>
                        <a
                          className="button"
                          download
                          href={media(render.captions)}
                        >
                          Captions
                        </a>
                        <a
                          className="button"
                          download
                          href={media(render.manifest)}
                        >
                          Manifest
                        </a>
                      </div>
                    )}
                  </section>
                  <aside>
                    <section className="editor-section production-panel">
                      <div className="eyebrow">PRODUCTION BRIEF</div>
                      <h2>Ready for a first look?</h2>
                      <dl>
                        <div>
                          <dt>Narration</dt>
                          <dd>
                            {
                              story.segments
                                .map((s) => s.text)
                                .join(" ")
                                .trim()
                                .split(/\s+/)
                                .filter(Boolean).length
                            }{" "}
                            words
                          </dd>
                        </div>
                        <div>
                          <dt>Scenes</dt>
                          <dd>{story.segments.length}</dd>
                        </div>
                        <div>
                          <dt>Evidence checks</dt>
                          <dd>
                            {currentGates.length === 0
                              ? "Passed"
                              : `${currentGates.length} open`}
                          </dd>
                        </div>
                        <div>
                          <dt>Voice</dt>
                          <dd>{render?.voice || overview.voice}</dd>
                        </div>
                      </dl>
                      <p className="hint">
                        {render?.captionTiming ||
                          "Synthetic narration and captions require playback review before approval."}
                      </p>
                      {render?.captionWarnings?.map((warning, i) => (
                        <p className="render-error" key={i}>
                          {warning}
                        </p>
                      ))}
                      {render?.privatePreview && (
                        <p className="hint">
                          <strong>
                            Automatic private preview · editorial review pending
                          </strong>
                          <br />
                          {story.format === "brief"
                            ? "Short update using the currently supported findings."
                            : "Source-linked narration prepared automatically."}{" "}
                          Final production requires editorial checks.
                        </p>
                      )}
                      {render?.warnings?.map((warning, i) => (
                        <p className="hint" key={`preview-${i}`}>
                          {warning}
                        </p>
                      ))}
                      {job ? (
                        <div className="job-progress">
                          <Loader2 className="spin" size={18} />
                          <div>
                            <strong>Production in progress</strong>
                            <p>{job.progress}</p>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="button primary full"
                          disabled={
                            busy ||
                            (!!render && !render.privatePreview) ||
                            currentGates.some((g) => g.code !== "review") ||
                            dirty
                          }
                          onClick={() =>
                            void act(
                              () =>
                                api(`/stories/${story.id}/render`, "POST", {
                                  version: story.version,
                                }),
                              "Production queued. You can keep the desk open while it renders.",
                            )
                          }
                        >
                          <Clapperboard size={17} />
                          {render?.privatePreview
                            ? "Create final render after review"
                            : render
                              ? "This revision is rendered"
                              : "Generate private preview"}
                        </button>
                      )}
                      {lastJob?.status === "failed" && (
                        <p className="render-error">{lastJob.error}</p>
                      )}
                      {currentGates.length > 0 && (
                        <button
                          className="text-button"
                          onClick={() => go("Research")}
                        >
                          Resolve editorial checks <ArrowRight size={14} />
                        </button>
                      )}
                      <button
                        className="text-button"
                        onClick={() => go("Publishing")}
                        disabled={!render}
                      >
                        Review exports <ArrowRight size={14} />
                      </button>
                    </section>
                    <section className="editor-section">
                      <h2>Source page</h2>
                      <p className="hint">
                        Generated from the same claims and citations as the
                        video. Public access starts after editorial approval.
                      </p>
                      <a
                        className="text-button"
                        target="_blank"
                        rel="noreferrer"
                        href={`/api/stories/${story.id}/source-page`}
                      >
                        Inspect private draft <ExternalLink size={14} />
                      </a>
                    </section>
                    <section className="editor-section">
                      <h2>Pronunciation dictionary</h2>
                      <p className="hint">
                        Use one name and pronunciation per line, separated by =.
                        Saving creates a new revision.
                      </p>
                      <textarea
                        rows={4}
                        aria-label="Pronunciation dictionary"
                        defaultValue={Object.entries(draft.pronunciations)
                          .map(([k, v]) => `${k}=${v}`)
                          .join("\n")}
                        onChange={(e) => {
                          const entries = e.target.value
                            .split("\n")
                            .filter((l) => l.includes("="))
                            .map((l) => {
                              const [k, ...v] = l.split("=");
                              return [k.trim(), v.join("=").trim()];
                            })
                            .filter(([k, v]) => k && v);
                          update({
                            pronunciations: Object.fromEntries(entries),
                          });
                        }}
                      />
                      <button
                        className="button"
                        disabled={!dirty || busy}
                        onClick={() => void save()}
                      >
                        Save pronunciations
                      </button>
                    </section>
                    <AssetPanel
                      story={story}
                      disabled={busy || dirty || !!job}
                      act={act}
                    />
                  </aside>
                </div>
              )}
              {page === "Publishing" && story && (
                <Publishing
                  story={story}
                  gates={currentGates.length}
                  paused={overview.settings.paused}
                  busy={busy}
                  act={act}
                />
              )}
              {page === "Corrections" && story && (
                <Corrections story={story} busy={busy} act={act} />
              )}
              {page === "Settings" && (
                <div className="settings-grid">
                  <PilotPanel pilot={overview.pilot} />
                  <section className="editor-section">
                    <div className="eyebrow">OPERATING MODE</div>
                    <h2>A private, manual-first newsroom.</h2>
                    <dl>
                      <div>
                        <dt>Database</dt>
                        <dd>{overview.storage}</dd>
                      </div>
                      <div>
                        <dt>Narration</dt>
                        <dd>{overview.voice}</dd>
                      </div>
                      <div>
                        <dt>Publishing</dt>
                        <dd>{overview.publishing}</dd>
                      </div>
                      <div>
                        <dt>Discovery</dt>
                        <dd>Manual URL / topic</dd>
                      </div>
                      <div>
                        <dt>Approvals</dt>
                        <dd>Required · exact revision</dd>
                      </div>
                      <div>
                        <dt>Private production</dt>
                        <dd>Automatic after research · local narration</dd>
                      </div>
                      <div>
                        <dt>Automatic publishing</dt>
                        <dd>Disabled · approval required</dd>
                      </div>
                    </dl>
                    <button
                      className="button"
                      onClick={() =>
                        void act(() =>
                          api("/settings", "POST", {
                            paused: !overview.settings.paused,
                          }),
                        )
                      }
                    >
                      {overview.settings.paused ? (
                        <Play size={15} />
                      ) : (
                        <Pause size={15} />
                      )}{" "}
                      {overview.settings.paused
                        ? "Unpause publishing"
                        : "Pause publishing"}
                    </button>
                    <p className="hint">
                      Pause blocks future publication actions. This build has no
                      live publisher and cannot recall a post already accepted
                      by a platform.
                    </p>
                  </section>
                  <section className="editor-section">
                    <div className="eyebrow">BEFORE PRODUCTION</div>
                    <h2>Decisions still to make</h2>
                    <ol className="decision-list">
                      <li>
                        <strong>Monthly operating budget</strong>
                        <span>
                          Research, narration, hosting, and media rights.
                        </span>
                      </li>
                      <li>
                        <strong>Server and domain</strong>
                        <span>
                          HTTPS, off-server backups, and authentication.
                        </span>
                      </li>
                      <li>
                        <strong>Channel identity and licensed voice</strong>
                        <span>
                          World News is a temporary development brand.
                        </span>
                      </li>
                      <li>
                        <strong>Instagram account access</strong>
                        <span>
                          Professional account, permissions, and a reviewed live
                          test.
                        </span>
                      </li>
                      <li>
                        <strong>Pilot review routine</strong>
                        <span>
                          Choose review times and a notification method.
                        </span>
                      </li>
                    </ol>
                    <p className="hint">
                      Provider secrets belong in backend environment variables.
                      No credentials are stored in this browser.
                    </p>
                  </section>
                </div>
              )}
              {page !== "Stories" && page !== "Settings" && !story && (
                <div className="empty">
                  <BookOpen size={30} />
                  <h2>Add your first story.</h2>
                  <p>Open a dossier with a URL or topic to begin.</p>
                  <button className="button" onClick={() => setNewOpen(true)}>
                    New story
                  </button>
                </div>
              )}
              <footer className="workspace-footer">
                <span>
                  WORLD NEWS <span>/</span> THE EDITORIAL DESK
                </span>
                <span>Evidence first. Human approved.</span>
              </footer>
            </>
          )}
        </main>
      </div>
      {newOpen && (
        <div
          className="modal-backdrop"
          onClick={() => !busy && setNewOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-title"
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close new story"
              onClick={() => setNewOpen(false)}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">OPEN A DOSSIER</div>
            <h2 id="new-title">What’s the story?</h2>
            <p>
              Add a topic or source URL. The research bot can find further
              sources and check the story’s evidence.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(async () => {
                  const s = await api<Story & { researchError?: string }>(
                    "/stories",
                    "POST",
                    {
                      title: f.get("title"),
                      research: f.get("research") === "on",
                      autoProduce: f.get("autoProduce") === "on",
                      ...(f.get("url") ? { url: f.get("url") } : {}),
                    },
                  );
                  setSelected(s.id);
                  setPage("Research");
                  setNewOpen(false);
                  if (s.researchError)
                    throw new Error(`Dossier saved. ${s.researchError}`);
                }, "Research dossier created.");
              }}
            >
              <label>
                Working headline
                <input
                  name="title"
                  required
                  maxLength={140}
                  placeholder="A development worth understanding"
                  autoFocus
                />
              </label>
              <label>
                Source URL <span className="optional">optional</span>
                <input name="url" type="url" placeholder="https://…" />
              </label>
              <p className="hint">
                Research retrieves public HTML/text pages. Inaccessible pages
                remain leads; bot findings need review before production.
              </p>
              <label className="review-checkbox">
                <input
                  type="checkbox"
                  name="research"
                  defaultChecked={
                    !!overview?.pilot?.enabled &&
                    !!overview?.pilot?.providers.claude &&
                    overview.pilot.remainingUsd >= 1
                  }
                />
                <span>
                  Start the research bot automatically · US$1.00 allowance
                </span>
              </label>
              <label className="review-checkbox">
                <input type="checkbox" name="autoProduce" defaultChecked />
                <span>
                  Automatically prepare a script and private video after
                  research · local narration
                </span>
              </label>
              <button className="button primary full" disabled={busy}>
                {busy ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Plus size={16} />
                )}
                Open research dossier
              </button>
            </form>
          </section>
        </div>
      )}
      {busy && (
        <div className="busy-indicator" role="status">
          <Loader2 size={16} className="spin" />
          Working…
        </div>
      )}
    </div>
  );
}
type Act = (fn: () => Promise<unknown>, message?: string) => Promise<void>;
function SourcePanel({
  story,
  disabled,
  act,
}: {
  story: Story;
  disabled: boolean;
  act: Act;
}) {
  const [url, setUrl] = useState("");
  return (
    <section className="editor-section source-panel">
      <div className="section-title">
        <h2>Source registry</h2>
        <Link2 size={18} />
      </div>
      <form
        className="source-input"
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            await api(`/stories/${story.id}/sources`, "POST", {
              version: story.version,
              url,
            });
            setUrl("");
          }, "Source retrieved. Review its origin and metadata.");
        }}
      >
        <input
          type="url"
          required
          aria-label="Add source URL"
          placeholder="Paste a source URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          className="button"
          aria-label="Retrieve source"
          disabled={disabled || !url}
        >
          <Plus size={18} />
        </button>
      </form>
      {story.sources.map((s, i) => (
        <details className="source-detail" key={s.id}>
          <summary>
            <span className="source-index">
              S{String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <strong>{s.publisher}</strong>
              <span>
                {s.kind} · {s.lineage}
              </span>
            </div>
            <ChevronDown size={15} />
          </summary>
          <p>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title}
              <ArrowUpRight size={13} />
            </a>
          </p>
          <small>
            Retrieved {date(s.retrievedAt)} · {s.language}
            <br />
            Publication {s.publishedAt ? date(s.publishedAt) : "not provided"}
          </small>
          {s.research && (
            <p className="hint">
              Bot assessment: {s.research.assessment}
              <br />
              {s.research.metadataReviewed
                ? "Source metadata reviewed."
                : "Review source type and originating lineage, then save metadata to confirm."}
            </p>
          )}
          <SourceMetadata
            key={s.id + story.version}
            source={s}
            story={story}
            disabled={disabled}
            act={act}
          />
          <details className="snapshot">
            <summary>
              <FileText size={14} />
              Read source snapshot
            </summary>
            <p>{s.text}</p>
            <small>SHA-256: {s.hash}</small>
          </details>
          <button
            className="text-button"
            disabled={disabled}
            onClick={() =>
              void act(async () => {
                const r = await api(`/stories/${story.id}/recheck`, "POST", {
                  version: story.version,
                  sourceId: s.id,
                });
                if (r.changed)
                  throw new Error(
                    "Source changed. A new revision was created and approval invalidated. Review affected claims.",
                  );
              }, "Source text is unchanged.")
            }
          >
            <RefreshCw size={13} />
            Recheck source
          </button>
        </details>
      ))}
      {!story.sources.length && (
        <p className="hint">
          Add a source, read it, then link exact passages to claims. Mark an
          original announcement as primary only after checking it.
        </p>
      )}
      <p className="source-caution">
        <ShieldCheck size={15} />
        Several pages sharing one origin count as one source lineage.
      </p>
    </section>
  );
}
function SourceMetadata({
  source: s,
  story,
  disabled,
  act,
}: {
  source: Source;
  story: Story;
  disabled: boolean;
  act: Act;
}) {
  return (
    <form
      className="metadata-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void act(
          () =>
            api(`/stories/${story.id}/sources/${s.id}`, "PATCH", {
              version: story.version,
              ...Object.fromEntries(f),
            }),
          "Source metadata saved. Evidence needs a fresh check.",
        );
      }}
    >
      <label>
        Publisher
        <input name="publisher" defaultValue={s.publisher} required />
      </label>
      <label>
        Author / speaker
        <input name="author" defaultValue={s.author} />
      </label>
      <label>
        Published date
        <input
          name="publishedAt"
          defaultValue={s.publishedAt}
          placeholder="As stated by the publisher"
        />
      </label>
      <label>
        Shared origin / lineage
        <input name="lineage" defaultValue={s.lineage} required />
      </label>
      <div className="two-fields">
        <label>
          Source type
          <select name="kind" defaultValue={s.kind}>
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
          </select>
        </label>
        <label>
          Language
          <input
            name="language"
            defaultValue={s.language}
            required
            minLength={2}
          />
        </label>
      </div>
      <button className="button" disabled={disabled}>
        Save metadata
      </button>
    </form>
  );
}
function Publishing({
  story,
  gates,
  paused,
  busy,
  act,
}: {
  story: Story;
  gates: number;
  paused: boolean;
  busy: boolean;
  act: Act;
}) {
  const [destinations, setDestinations] = useState<string[]>(["Instagram"]);
  const [checked, setChecked] = useState(false);
  const [captionsChecked, setCaptionsChecked] = useState(false);
  const [editor, setEditor] = useState("");
  useEffect(() => setChecked(false), [story.id, story.version]);
  useEffect(() => setCaptionsChecked(false), [story.id, story.version]);
  const render = story.renders.find((r) => r.version === story.version);
  return (
    <div className="publishing-layout">
      <section className="editor-section">
        <div className="eyebrow">DESTINATIONS</div>
        <h2>Prepare platform exports</h2>
        <p className="hint">
          These selections record editorial intent. All connectors are
          unconfigured; approval does not upload or post content.
        </p>
        {["Instagram", "YouTube", "X", "TikTok"].map((p, i) => (
          <label key={p} className="destination">
            <input
              type="checkbox"
              checked={destinations.includes(p)}
              disabled={!!story.approval}
              onChange={(e) =>
                setDestinations(
                  e.target.checked
                    ? [...destinations, p]
                    : destinations.filter((d) => d !== p),
                )
              }
            />
            <span className="platform-symbol">{["ig", "▶", "𝕏", "♪"][i]}</span>
            <div>
              <strong>{p}</strong>
              <small>
                {
                  [
                    "Feed card + vertical master · first live integration planned",
                    "Vertical master · private upload test required",
                    "Adapted media + source links · API access required",
                    "Export for creator upload · eligibility review required",
                  ][i]
                }
              </small>
            </div>
            <span className="badge">Not connected</span>
          </label>
        ))}
        <div className="alert neutral">
          <Pause size={17} />
          {paused
            ? "Global publication pause is on."
            : "Publishing is unpaused; no live connectors are installed."}
        </div>
        <a
          className="text-button"
          href={`/api/stories/${story.id}/source-page`}
          target="_blank"
          rel="noreferrer"
        >
          Review source-page preview <ArrowUpRight size={15} />
        </a>
      </section>
      <section className="editor-section approval-panel">
        <ShieldCheck size={30} strokeWidth={1.3} />
        <h2>{story.approval ? "Approved for export." : "Your final check."}</h2>
        {story.approval ? (
          <>
            <p>
              Version {story.approval.version} was approved by{" "}
              <strong>{story.approval.editor}</strong> for{" "}
              {story.approval.destinations.join(", ")}.
            </p>
            <p className="hint">
              {date(story.approval.at)} · No public social post was made.
            </p>
            <a
              className="button full"
              href={`/s/${story.id.slice(0, 8)}?v=${story.version}`}
              target="_blank"
              rel="noreferrer"
            >
              Open approved source page <ExternalLink size={15} />
            </a>
            {render && (
              <a
                className="button primary full"
                download
                href={media(render.video)}
              >
                Download approved video <Download size={15} />
              </a>
            )}
          </>
        ) : (
          <>
            <p>
              Watch the video and check the headline, captions, citations,
              pronunciations, media context, and every factual claim.
            </p>
            <dl>
              <div>
                <dt>Version</dt>
                <dd>{story.version}</dd>
              </div>
              <div>
                <dt>Editorial gates</dt>
                <dd>{gates ? `${gates} open` : "Clear"}</dd>
              </div>
              <div>
                <dt>Media</dt>
                <dd>{render ? "Rendered" : "Not rendered"}</dd>
              </div>
            </dl>
            <label>
              Reviewed by
              <input
                value={editor}
                onChange={(e) => setEditor(e.target.value)}
                placeholder="Editor name"
              />
            </label>
            <label className="review-check">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <span>
                I inspected this version’s evidence and played the rendered
                video, including captions and source overlays.
              </span>
            </label>
            {!!render?.captionWarnings?.length && (
              <>
                <p className="render-error">
                  {render.captionWarnings.join(" ")}
                </p>
                <label className="review-check">
                  <input
                    type="checkbox"
                    checked={captionsChecked}
                    onChange={(e) => setCaptionsChecked(e.target.checked)}
                  />
                  <span>
                    I compared the recognized captions with the narration and
                    evidence, including every name and number.
                  </span>
                </label>
              </>
            )}
            <button
              className="button primary full"
              disabled={
                busy ||
                !render ||
                gates > 0 ||
                !checked ||
                editor.trim().length < 2 ||
                !destinations.length ||
                (!!render?.captionWarnings?.length && !captionsChecked)
              }
              onClick={() =>
                void act(
                  () =>
                    api(`/stories/${story.id}/approve`, "POST", {
                      version: story.version,
                      editor,
                      destinations,
                      previewChecked: true,
                      captionsChecked,
                    }),
                  "Exact revision approved for export. No social post was made.",
                )
              }
            >
              <CheckCheck size={17} />
              Approve revision {story.version}
            </button>
            <small>
              Material edits invalidate approval and require fresh media.
            </small>
          </>
        )}
      </section>
    </div>
  );
}
function Corrections({
  story,
  busy,
  act,
}: {
  story: Story;
  busy: boolean;
  act: Act;
}) {
  const [text, setText] = useState("");
  const [history, setHistory] = useState<Story[]>([]);
  useEffect(() => {
    void api<Story[]>(`/stories/${story.id}/history`)
      .then(setHistory)
      .catch(() => {});
  }, [story.id, story.version]);
  return (
    <div className="settings-grid">
      <section className="editor-section">
        <h2>Correction log</h2>
        <p className="hint">
          An entry creates a new revision and invalidates approval. Approved
          source pages retain a visible correction log.
        </p>
        {story.corrections.map((c, i) => (
          <div className="correction" key={i}>
            <small>
              {date(c.at)} · v{c.version}
            </small>
            <p>{c.text}</p>
          </div>
        ))}
        {!story.corrections.length && (
          <div className="empty compact">
            <History size={26} />
            <p>No corrections recorded for this story.</p>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api(`/stories/${story.id}/corrections`, "POST", {
                version: story.version,
                text,
              });
              setText("");
            }, "Correction recorded. Update the story and render a new revision.");
          }}
        >
          <label>
            What changed?
            <textarea
              rows={5}
              required
              minLength={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Describe the original error, corrected information, and supporting source."
            />
          </label>
          <button
            className="button primary"
            disabled={busy || text.trim().length < 5}
          >
            Record correction
          </button>
        </form>
      </section>
      <section className="editor-section">
        <h2>Revision history</h2>
        {history.length ? (
          history.map((s) => (
            <div className="history-row" key={s.version}>
              <span>v{s.version}</span>
              <div>
                <strong>{s.title}</strong>
                <small>
                  {date(s.updatedAt)} · {status(s.stage)} · {s.segments.length}{" "}
                  segments
                </small>
              </div>
            </div>
          ))
        ) : (
          <p className="hint">
            Revisions appear here after the first edit or render.
          </p>
        )}
        <p className="hint">
          Successful platform posts and uncertain upload outcomes will be
          tracked independently when live connectors are implemented.
        </p>
      </section>
    </div>
  );
}
function AssetPanel({
  story,
  disabled,
  act,
}: {
  story: Story;
  disabled: boolean;
  act: Act;
}) {
  const [image, setImage] = useState("");
  const [imageError, setImageError] = useState("");
  return (
    <section className="editor-section">
      <div className="section-title">
        <h2>Related photos</h2>
        <ImagePlus size={18} />
      </div>
      <p className="hint">
        Automatically find reusable Commons photographs, record credits and
        dates, and rebuild the private preview. Archive context images are
        labelled and require review.
      </p>
      <button
        className="button"
        disabled={
          disabled ||
          !story.segments.length ||
          ["held", "rejected", "approved"].includes(story.stage)
        }
        onClick={() =>
          void act(
            () =>
              api(`/stories/${story.id}/visuals`, "POST", {
                version: story.version,
              }),
            "Photo discovery queued. The private video will rebuild automatically.",
          )
        }
      >
        Find related photos & rebuild preview
      </button>
      <details>
        <summary className="asset-summary">
          <ImagePlus size={18} />
          <h2>Replace a scene visual</h2>
          <ChevronDown size={15} />
        </summary>
        <p className="hint">
          Use your own or licensed imagery. All fields are required. Select the
          uploaded image on a narration scene in Research.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(async () => {
              await api(`/stories/${story.id}/assets`, "POST", {
                version: story.version,
                image,
                creator: f.get("creator"),
                permission: f.get("permission"),
                provenance: f.get("provenance"),
                eventDate: f.get("eventDate"),
                location: f.get("location"),
                context: f.get("context"),
                archive: f.get("archive") === "on",
              });
              setImage("");
            }, "Asset stored with rights metadata. Select it in a scene and save a new revision.");
          }}
        >
          <label>
            Image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImageError("");
                if (file.size > 8_000_000) {
                  setImage("");
                  setImageError("Use an image smaller than 8 MB.");
                  e.target.value = "";
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => setImage(String(reader.result));
                reader.readAsDataURL(file);
              }}
            />
          </label>
          {imageError && (
            <p className="render-error" role="alert">
              {imageError}
            </p>
          )}
          {[
            "creator",
            "permission",
            "provenance",
            "eventDate",
            "location",
            "context",
          ].map((name) => (
            <label key={name}>
              {
                (
                  {
                    creator: "Photographer / creator",
                    permission: "License / documented usage permission",
                    provenance: "Original asset URL",
                    eventDate: "Event date",
                    location: "Location",
                    context: "Scene context / restrictions",
                  } as Record<string, string>
                )[name]
              }
              <input
                required
                name={name}
                type={
                  name === "provenance"
                    ? "url"
                    : name === "eventDate"
                      ? "date"
                      : "text"
                }
              />
            </label>
          ))}
          <label className="review-check">
            <input name="archive" type="checkbox" />
            <span>Archive image — label accordingly</span>
          </label>
          <button className="button" disabled={disabled || !image}>
            Store verified asset
          </button>
        </form>
      </details>
      {story.assets.map((a) => (
        <div className="asset-row" key={a.id}>
          <img src={media(a.file)} alt={a.context} />
          <div>
            <strong>{a.creator}</strong>
            <small>
              {a.permission} · {a.archive ? "Archive" : "Event image"}
            </small>
            {a.discovery && (
              <>
                <small>
                  {a.eventDate} · {a.location}
                </small>
                <p>
                  <a
                    href={a.discovery.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Original file & attribution
                  </a>{" "}
                  ·{" "}
                  <a
                    href={a.discovery.licenseUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    License
                  </a>
                </p>
                <small>{a.discovery.changes}</small>
                {!a.discovery.reviewed && (
                  <button
                    className="button"
                    disabled={disabled}
                    onClick={() =>
                      void act(
                        () =>
                          api(
                            `/stories/${story.id}/assets/${a.id}/review`,
                            "PATCH",
                            { version: story.version, reviewed: true },
                          ),
                        "Image identity, context and reuse review recorded in a new revision.",
                      )
                    }
                  >
                    Confirm image identity, context & reuse rights
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
