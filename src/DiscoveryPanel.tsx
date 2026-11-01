import { useEffect, useState } from "react";
import { Radio, Plus, X, ExternalLink, AlertCircle } from "lucide-react";
import type { Discovery, Lead } from "../shared/types";
type Act = (fn: () => Promise<unknown>, message?: string) => Promise<void>;
async function call(url: string, method = "GET", body?: unknown) {
  const r = await fetch("/api" + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed.");
  return data;
}
// Public syndication feeds across regions; review each publisher's terms before relying on them.
const starter: [string, string][] = [
  ["BBC World", "https://feeds.bbci.co.uk/news/world/rss.xml"],
  ["Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"],
  ["NPR World", "https://feeds.npr.org/1004/rss.xml"],
  ["DW World", "https://rss.dw.com/xml/rss-en-world"],
  ["France 24", "https://www.france24.com/en/rss"],
  ["Guardian World", "https://www.theguardian.com/world/rss"],
  [
    "AllAfrica",
    "https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf",
  ],
  ["ABC Australia", "https://www.abc.net.au/news/feed/2942460/rss.xml"],
  ["MercoPress", "https://en.mercopress.com/rss"],
];
const ago = (iso: string) => {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  return h < 1
    ? "under an hour ago"
    : h < 48
      ? `${h}h ago`
      : `${Math.round(h / 24)}d ago`;
};
export function DiscoveryPanel({
  act,
  open,
}: {
  act: Act;
  open: (title: string, url: string) => void;
}) {
  const [data, setData] = useState<Discovery>();
  const [error, setError] = useState("");
  const load = () =>
    call("/discovery").then(
      (d) => (setData(d), setError("")),
      (e) => setError(e.message),
    );
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, []);
  const run = (fn: () => Promise<unknown>, message: string) =>
    act(async () => {
      await fn();
      await load();
    }, message);
  const registered = new Set(data?.feeds.map((f) => f.url));
  return (
    <section className="discovery">
      <div className="section-title">
        <h2>
          Leads from feeds <span>{data?.leads.length || 0}</span>
        </h2>
        <Radio size={16} />
      </div>
      <p className="hint">
        Headlines from your feeds in the last 72 hours, grouped and ranked by
        how many feeds carry them. Several feeds can repeat one original report,
        so this is a lead, not corroboration. Checked every{" "}
        {data?.pollMinutes || 15} minutes.
      </p>
      {error && (
        <p className="lead-warning">
          <AlertCircle size={13} /> {error}
        </p>
      )}
      {data?.leads.map((lead: Lead) => (
        <article className="lead" key={lead.id}>
          <div className="row-kicker">
            {lead.feeds} {lead.feeds === 1 ? "feed" : "feeds"} <span>·</span>{" "}
            {lead.items.length} {lead.items.length === 1 ? "report" : "reports"}{" "}
            <span>·</span> {ago(lead.latestAt)}
            {lead.story && <em>POSSIBLE UPDATE</em>}
          </div>
          <h3>{lead.title}</h3>
          {lead.story && (
            <p className="lead-update">
              {lead.story.newItems} new{" "}
              {lead.story.newItems === 1 ? "report" : "reports"} related to “
              {lead.story.title}”
            </p>
          )}
          <details>
            <summary>Reports</summary>
            <ul>
              {lead.items.map((i) => (
                <li key={i.id}>
                  <a href={i.url} target="_blank" rel="noreferrer noopener">
                    {i.feed}: {i.title} <ExternalLink size={11} />
                  </a>
                </li>
              ))}
            </ul>
          </details>
          {lead.warnings.map((w) => (
            <p className="lead-warning" key={w}>
              <AlertCircle size={13} /> {w}
            </p>
          ))}
          <div className="lead-actions">
            <button
              className="text-button"
              onClick={() => open(lead.title, lead.items[0].url)}
            >
              <Plus size={14} /> Open dossier
            </button>
            <button
              className="text-button"
              onClick={() =>
                void run(
                  () =>
                    call("/discovery/dismiss", "POST", {
                      itemIds: lead.items.map((i) => i.id),
                    }),
                  "Lead dismissed.",
                )
              }
            >
              <X size={14} /> Dismiss
            </button>
          </div>
        </article>
      ))}
      {data && !data.leads.length && (
        <p className="hint">
          {data.feeds.length
            ? "No new leads yet. New feeds are checked within a minute."
            : "Add a feed below to start finding stories automatically."}
        </p>
      )}
      <details className="feeds">
        <summary>Feeds ({data?.feeds.length || 0})</summary>
        {data?.feeds.map((f) => (
          <div className="feed-row" key={f.url}>
            <div>
              <strong>{f.name}</strong>
              <small>
                {f.error
                  ? `Error: ${f.error}`
                  : f.lastPolledAt
                    ? `${f.itemCount ?? 0} items · checked ${ago(f.lastPolledAt)}`
                    : "Waiting for first check"}
              </small>
            </div>
            <button
              className="text-button"
              aria-label={`Remove ${f.name}`}
              onClick={() =>
                void run(
                  () => call("/feeds", "DELETE", { url: f.url }),
                  "Feed removed.",
                )
              }
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <form
          className="feed-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            void run(
              () =>
                call("/feeds", "POST", {
                  name: f.get("name"),
                  url: f.get("url"),
                }).then(() => form.reset()),
              "Feed added.",
            );
          }}
        >
          <input
            name="name"
            required
            maxLength={80}
            placeholder="Name"
            aria-label="Feed name"
          />
          <input
            name="url"
            type="url"
            required
            placeholder="https://… RSS or Atom URL"
            aria-label="Feed URL"
          />
          <button className="button">Add feed</button>
        </form>
        {starter.some(([, url]) => !registered.has(url)) && (
          <>
            <p className="hint">Suggested public feeds:</p>
            <div className="starter-feeds">
              {starter
                .filter(([, url]) => !registered.has(url))
                .map(([name, url]) => (
                  <button
                    key={url}
                    className="badge"
                    onClick={() =>
                      void run(
                        () => call("/feeds", "POST", { name, url }),
                        `${name} added.`,
                      )
                    }
                  >
                    <Plus size={11} /> {name}
                  </button>
                ))}
            </div>
          </>
        )}
      </details>
    </section>
  );
}
