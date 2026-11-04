import { DatabaseSync } from "node:sqlite";
import { Pool, type PoolClient } from "pg";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type {
  Story,
  Job,
  Settings,
  CostEvent,
  AIReport,
  ResearchRun,
  Source,
  Feed,
  FeedItem,
} from "../shared/types.js";
import { actualUsd } from "./pricing.js";

export const dataDir = path.resolve(process.env.DATA_DIR || "data");
mkdirSync(dataDir, { recursive: true });
export class Store {
  private sqlite?: DatabaseSync;
  private pool?: Pool;
  constructor(url?: string, filename = path.join(dataDir, "news.sqlite")) {
    if (url) this.pool = new Pool({ connectionString: url, max: 5 });
    else {
      this.sqlite = new DatabaseSync(filename);
      this.sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    }
  }
  async query(
    sql: string,
    values: (string | number | null)[] = [],
    client?: PoolClient,
  ): Promise<any[]> {
    if (this.pool) {
      let n = 0;
      return (
        await (client || this.pool).query(
          sql.replace(/\?/g, () => `$${++n}`),
          values,
        )
      ).rows;
    }
    const statement = this.sqlite!.prepare(sql);
    return statement.columns().length
      ? statement.all(...values)
      : (statement.run(...values), []);
  }
  async init() {
    const migrationClient = await this.pool?.connect();
    if (migrationClient)
      await migrationClient.query("SELECT pg_advisory_lock(776631001)");
    try {
      for (const sql of [
        "CREATE TABLE IF NOT EXISTS stories (id TEXT PRIMARY KEY, version INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS versions (story_id TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(story_id,version))",
        "CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, story_id TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL, lease BIGINT NOT NULL DEFAULT 0, body TEXT NOT NULL)",
        "CREATE UNIQUE INDEX IF NOT EXISTS one_active_render ON jobs(story_id,version) WHERE status IN ('queued','running')",
        "CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, body TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS approved_snapshots (story_id TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(story_id,version))",
        "CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, at TEXT NOT NULL, action TEXT NOT NULL, body TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS pilot_budget (id TEXT PRIMARY KEY, limit_micros BIGINT NOT NULL, reserved_micros BIGINT NOT NULL DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS cost_events (id TEXT PRIMARY KEY, operation_key TEXT NOT NULL UNIQUE, story_id TEXT NOT NULL, body TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS ai_reports (id TEXT PRIMARY KEY, story_id TEXT NOT NULL, body TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS research_runs (id TEXT PRIMARY KEY, story_id TEXT NOT NULL, status TEXT NOT NULL, lease BIGINT NOT NULL DEFAULT 0, body TEXT NOT NULL)",
        "CREATE UNIQUE INDEX IF NOT EXISTS one_active_research ON research_runs(story_id) WHERE status IN ('queued','running')",
        "CREATE TABLE IF NOT EXISTS research_sources (run_id TEXT NOT NULL, source_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(run_id,source_id))",
        "CREATE TABLE IF NOT EXISTS feeds (url TEXT PRIMARY KEY, polled_at BIGINT NOT NULL DEFAULT 0, body TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS feed_items (id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, feed_url TEXT NOT NULL, seen_at TEXT NOT NULL, dismissed INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL)",
      ])
        await this.query(sql, [], migrationClient);
      try {
        await this.query(
          "SELECT revision FROM stories LIMIT 1",
          [],
          migrationClient,
        );
      } catch {
        await this.query(
          "ALTER TABLE stories ADD COLUMN revision INTEGER NOT NULL DEFAULT 0",
          [],
          migrationClient,
        );
      }
      try {
        await this.query(
          "SELECT settled FROM cost_events LIMIT 1",
          [],
          migrationClient,
        );
      } catch {
        await this.query(
          "ALTER TABLE cost_events ADD COLUMN settled INTEGER NOT NULL DEFAULT 0",
          [],
          migrationClient,
        );
      }
      await this.query(
        "INSERT INTO settings(id,body) VALUES(?,?) ON CONFLICT(id) DO NOTHING",
        ["global", JSON.stringify({ paused: true })],
        migrationClient,
      );
      const ceiling = Number(process.env.PILOT_BUDGET_USD || 0);
      if (!Number.isFinite(ceiling) || ceiling < 0 || ceiling > 100)
        throw new Error("PILOT_BUDGET_USD must be between 0 and 100.");
      await this.query(
        "INSERT INTO pilot_budget(id,limit_micros,reserved_micros) VALUES(?,?,0) ON CONFLICT(id) DO NOTHING",
        ["pilot", Math.floor(ceiling * 1_000_000)],
        migrationClient,
      );
      // A previously disabled, unused pilot can be initialized; consumed budgets never reset on restart.
      if (ceiling > 0)
        await this.query(
          "UPDATE pilot_budget SET limit_micros=? WHERE id=? AND limit_micros=0 AND reserved_micros=0",
          [Math.floor(ceiling * 1_000_000), "pilot"],
          migrationClient,
        );
    } finally {
      if (migrationClient) {
        await migrationClient.query("SELECT pg_advisory_unlock(776631001)");
        migrationClient.release();
      }
    }
    // Settle calls that finished before cost settlement existed.
    for (const event of await this.costs())
      if (["succeeded", "held"].includes(event.state) && !event.actualUsd)
        await this.finishCost(event);
  }
  async list(): Promise<Story[]> {
    return (await this.query("SELECT body,revision FROM stories"))
      .map((r) => ({ ...JSON.parse(r.body), revision: Number(r.revision) }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(id: string): Promise<Story | undefined> {
    const rows = await this.query(
      "SELECT body,revision FROM stories WHERE id=?",
      [id],
    );
    return (
      rows[0] && {
        ...JSON.parse(rows[0].body),
        revision: Number(rows[0].revision),
      }
    );
  }
  async create(story: Story) {
    await this.query("INSERT INTO stories(id,version,body) VALUES(?,?,?)", [
      story.id,
      story.version,
      JSON.stringify(story),
    ]);
  }
  async save(story: Story, expected: number) {
    const revision = story.revision || 0;
    const rows = await this.query(
      "UPDATE stories SET body=?, version=?, revision=revision+1 WHERE id=? AND version=? AND revision=? RETURNING id",
      [
        JSON.stringify({ ...story, revision: revision + 1 }),
        story.version,
        story.id,
        expected,
        revision,
      ],
    );
    if (!rows.length)
      throw Object.assign(
        new Error(
          "This story changed in another window. Refresh and try again.",
        ),
        { status: 409 },
      );
    story.revision = revision + 1;
  }
  async snapshot(story: Story) {
    await this.query(
      "INSERT INTO versions(story_id,version,body) VALUES(?,?,?) ON CONFLICT(story_id,version) DO NOTHING",
      [story.id, story.version, JSON.stringify(story)],
    );
  }
  async history(id: string): Promise<Story[]> {
    return (
      await this.query(
        "SELECT body FROM versions WHERE story_id=? ORDER BY version DESC",
        [id],
      )
    ).map((r) => JSON.parse(r.body));
  }
  async approveSnapshot(story: Story) {
    await this.query(
      "INSERT INTO approved_snapshots(story_id,version,body) VALUES(?,?,?) ON CONFLICT(story_id,version) DO UPDATE SET body=excluded.body",
      [story.id, story.version, JSON.stringify(story)],
    );
  }
  async approved(id: string, version?: number): Promise<Story | undefined> {
    const rows = await this.query(
      "SELECT body FROM approved_snapshots WHERE story_id=?" +
        (version ? " AND version=?" : "") +
        " ORDER BY version DESC LIMIT 1",
      version ? [id, version] : [id],
    );
    return rows[0] && JSON.parse(rows[0].body);
  }
  async settings(): Promise<Settings> {
    return JSON.parse(
      (await this.query("SELECT body FROM settings WHERE id=?", ["global"]))[0]
        .body,
    );
  }
  async setSettings(settings: Settings) {
    await this.query("UPDATE settings SET body=? WHERE id=?", [
      JSON.stringify(settings),
      "global",
    ]);
  }
  async jobs(): Promise<Job[]> {
    return (await this.query("SELECT body,status,lease FROM jobs")).map(
      (r) => ({
        ...JSON.parse(r.body),
        status: r.status,
        lease: Number(r.lease),
      }),
    );
  }
  async addJob(job: Job) {
    await this.query(
      "INSERT INTO jobs(id,story_id,version,status,lease,body) VALUES(?,?,?,?,?,?)",
      [
        job.id,
        job.storyId,
        job.version,
        job.status,
        job.lease,
        JSON.stringify(job),
      ],
    );
  }
  async updateJob(job: Job) {
    await this.query(
      "UPDATE jobs SET status=?,lease=?,body=? WHERE id=? AND status<>?",
      [job.status, job.lease, JSON.stringify(job), job.id, "cancelled"],
    );
  }
  async claimJob(id: string): Promise<boolean> {
    return (
      (
        await this.query(
          "UPDATE jobs SET status='running',lease=? WHERE id=? AND status='queued' RETURNING id",
          [Date.now() + 120000, id],
        )
      ).length > 0
    );
  }
  async cancelJobs(storyId: string) {
    await this.query(
      "UPDATE jobs SET status='cancelled' WHERE story_id=? AND status IN ('queued','running')",
      [storyId],
    );
  }
  async audit(action: string, body: unknown) {
    await this.query("INSERT INTO audit(id,at,action,body) VALUES(?,?,?,?)", [
      crypto.randomUUID(),
      new Date().toISOString(),
      action,
      JSON.stringify(body),
    ]);
  }
  async close() {
    this.sqlite?.close();
    await this.pool?.end();
  }
  async budget() {
    const row = (
      await this.query(
        "SELECT limit_micros,reserved_micros FROM pilot_budget WHERE id=?",
        ["pilot"],
      )
    )[0];
    return {
      limitUsd: Number(row.limit_micros) / 1_000_000,
      reservedUsd: Number(row.reserved_micros) / 1_000_000,
      remainingUsd:
        Math.max(0, Number(row.limit_micros) - Number(row.reserved_micros)) /
        1_000_000,
    };
  }
  async costs(): Promise<CostEvent[]> {
    return (await this.query("SELECT body FROM cost_events"))
      .map((r) => JSON.parse(r.body))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async reserveCost(event: CostEvent) {
    if (
      !Number.isFinite(event.reservedUsd) ||
      event.reservedUsd <= 0 ||
      !Number.isSafeInteger(Math.ceil(event.reservedUsd * 1_000_000))
    )
      throw new Error("A reservation must be a finite positive amount.");
    // Unique insertion happens before any paid request. Duplicate operations cannot spend again.
    try {
      await this.query(
        "INSERT INTO cost_events(id,operation_key,story_id,body) VALUES(?,?,?,?)",
        [event.id, event.operationKey, event.storyId, JSON.stringify(event)],
      );
    } catch {
      throw Object.assign(
        new Error(
          "This operation was already attempted for this revision. Inspect its usage record before creating a new revision to retry.",
        ),
        { status: 409 },
      );
    }
    const amount = Math.ceil(event.reservedUsd * 1_000_000);
    const rows = await this.query(
      "UPDATE pilot_budget SET reserved_micros=reserved_micros+? WHERE id=? AND reserved_micros+?<=limit_micros RETURNING id",
      [amount, "pilot", amount],
    );
    if (!rows.length) {
      event.state = "blocked";
      event.note = "Pilot ceiling reached; no provider request sent.";
      await this.finishCost(event);
      throw Object.assign(
        new Error("Pilot API ceiling reached. No paid request was sent."),
        { status: 402 },
      );
    }
  }
  // A finished call is priced from its recorded usage; the reservation then
  // reflects actual spend. Unpriceable or uncertain calls keep their reservation.
  async finishCost(event: CostEvent) {
    const settle =
      ["succeeded", "held"].includes(event.state) &&
      event.actualUsd === undefined;
    const actual = settle ? actualUsd(event) : undefined;
    if (actual !== undefined)
      event.actualUsd = Math.ceil(actual * 1_000_000) / 1_000_000;
    await this.query("UPDATE cost_events SET body=? WHERE id=?", [
      JSON.stringify(event),
      event.id,
    ]);
    if (actual === undefined) return;
    // Mark first: a crash can leave the reservation counted, never release it twice.
    const marked = await this.query(
      "UPDATE cost_events SET settled=1 WHERE id=? AND settled=0 RETURNING id",
      [event.id],
    );
    if (!marked.length) return;
    // Negative releases unused allowance; positive records spend beyond the reservation.
    const delta =
      Math.round(event.actualUsd! * 1_000_000) -
      Math.ceil(event.reservedUsd * 1_000_000);
    await this.query(
      "UPDATE pilot_budget SET reserved_micros=reserved_micros+? WHERE id=? AND reserved_micros+?>=0",
      [delta, "pilot", delta],
    );
    await this.audit("cost-settled", {
      eventId: event.id,
      reservedUsd: event.reservedUsd,
      actualUsd: event.actualUsd,
    });
  }
  async reconcileGoogleRejection(eventId: string, httpStatus: 400 | 500) {
    const event = (await this.costs()).find((e) => e.id === eventId);
    if (
      !event ||
      event.provider !== "gemini" ||
      !event.operation.startsWith("web-verify-saved") ||
      event.state !== "uncertain" ||
      event.usage?.verification
    )
      throw new Error(
        "Only an inspected Google verification rejection without a returned generation can be reconciled.",
      );
    const run = (await this.researchRuns()).find(
      (r) =>
        r.id === event.researchRunId &&
        r.storyId === event.storyId &&
        r.version === Number(event.operationKey.split(":")[1]) &&
        r.error ===
          `Gemini evidence checker returned HTTP ${httpStatus}. No automatic retry was made.`,
    );
    if (!run)
      throw new Error("No matching inspected provider rejection was found.");
    const previous = JSON.stringify(event);
    const released = {
      ...event,
      state: "released",
      note: `Inspected HTTP ${httpStatus} rejection: Google documents no token charge. Reservation reconciled once; operation remains non-repeatable. https://ai.google.dev/gemini-api/docs/billing#am-i-charged-for-failed-requests`,
    };
    const changed = await this.query(
      "UPDATE cost_events SET body=? WHERE id=? AND body=? RETURNING id",
      [JSON.stringify(released), eventId, previous],
    );
    if (!changed.length)
      throw new Error("This rejection was already reconciled.");
    // Mark first: a crash can retain excess allowance but can never credit it twice.
    const amount = Math.ceil(event.reservedUsd * 1_000_000);
    await this.query(
      "UPDATE pilot_budget SET reserved_micros=reserved_micros-? WHERE id=? AND reserved_micros>=?",
      [amount, "pilot", amount],
    );
    await this.audit("google-rejection-reconciled", {
      eventId,
      httpStatus,
      releasedUsd: event.reservedUsd,
    });
  }
  async addReport(report: AIReport) {
    await this.query("INSERT INTO ai_reports(id,story_id,body) VALUES(?,?,?)", [
      report.id,
      report.storyId,
      JSON.stringify(report),
    ]);
  }
  async reports(storyId: string): Promise<AIReport[]> {
    return (
      await this.query("SELECT body FROM ai_reports WHERE story_id=?", [
        storyId,
      ])
    )
      .map((r) => JSON.parse(r.body))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async updateReport(report: AIReport) {
    await this.query("UPDATE ai_reports SET body=? WHERE id=? AND story_id=?", [
      JSON.stringify(report),
      report.id,
      report.storyId,
    ]);
  }
  async researchRuns(): Promise<ResearchRun[]> {
    return (await this.query("SELECT body,status,lease FROM research_runs"))
      .map((r) => ({
        ...JSON.parse(r.body),
        status: r.status,
        lease: Number(r.lease),
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async addResearchSource(runId: string, source: Source) {
    await this.query(
      "INSERT INTO research_sources(run_id,source_id,body) VALUES(?,?,?) ON CONFLICT(run_id,source_id) DO NOTHING",
      [runId, source.id, JSON.stringify(source)],
    );
  }
  async researchSources(runId: string): Promise<Source[]> {
    return (
      await this.query("SELECT body FROM research_sources WHERE run_id=?", [
        runId,
      ])
    ).map((r) => JSON.parse(r.body));
  }
  async addResearch(run: ResearchRun) {
    try {
      await this.query(
        "INSERT INTO research_runs(id,story_id,status,lease,body) VALUES(?,?,?,?,?)",
        [run.id, run.storyId, run.status, run.lease, JSON.stringify(run)],
      );
    } catch {
      throw Object.assign(
        new Error("Research is already queued or running for this story."),
        { status: 409 },
      );
    }
  }
  async claimResearch(runId: string) {
    return (
      (
        await this.query(
          "UPDATE research_runs SET status='running',lease=? WHERE id=? AND status='queued' RETURNING id",
          [Date.now() + 120000, runId],
        )
      ).length > 0
    );
  }
  async updateResearch(run: ResearchRun) {
    await this.query(
      "UPDATE research_runs SET status=?,lease=?,body=? WHERE id=? AND status IN ('queued','running')",
      [run.status, run.lease, JSON.stringify(run), run.id],
    );
  }
  async feeds(): Promise<(Feed & { polledAt: number })[]> {
    return (await this.query("SELECT body,polled_at FROM feeds"))
      .map((r) => ({ ...JSON.parse(r.body), polledAt: Number(r.polled_at) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async addFeed(feed: Feed) {
    const rows = await this.query(
      "INSERT INTO feeds(url,polled_at,body) VALUES(?,0,?) ON CONFLICT(url) DO NOTHING RETURNING url",
      [feed.url, JSON.stringify(feed)],
    );
    if (!rows.length)
      throw Object.assign(new Error("This feed is already registered."), {
        status: 409,
      });
  }
  async removeFeed(url: string) {
    await this.query("DELETE FROM feeds WHERE url=?", [url]);
    await this.query("DELETE FROM feed_items WHERE feed_url=?", [url]);
  }
  // Conditional claim: only one process polls a feed per interval.
  async claimFeed(url: string, previous: number, at: number) {
    return (
      (
        await this.query(
          "UPDATE feeds SET polled_at=? WHERE url=? AND polled_at=? RETURNING url",
          [at, url, previous],
        )
      ).length > 0
    );
  }
  async updateFeed({ polledAt: _, ...feed }: Feed & { polledAt?: number }) {
    await this.query("UPDATE feeds SET body=? WHERE url=?", [
      JSON.stringify(feed),
      feed.url,
    ]);
  }
  async addFeedItems(feedUrl: string, items: FeedItem[]) {
    for (const item of items)
      await this.query(
        "INSERT INTO feed_items(id,url,feed_url,seen_at,body) VALUES(?,?,?,?,?) ON CONFLICT(url) DO NOTHING",
        [item.id, item.url, feedUrl, item.seenAt, JSON.stringify(item)],
      );
  }
  async feedItems(since: string): Promise<FeedItem[]> {
    return (
      await this.query(
        "SELECT body FROM feed_items WHERE dismissed=0 AND seen_at>=?",
        [since],
      )
    ).map((r) => JSON.parse(r.body));
  }
  async dismissFeedItems(ids: string[]) {
    for (const id of ids)
      await this.query("UPDATE feed_items SET dismissed=1 WHERE id=?", [id]);
  }
  async pruneFeedItems(before: string) {
    await this.query("DELETE FROM feed_items WHERE seen_at<?", [before]);
  }
}
