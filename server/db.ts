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
} from "../shared/types.js";

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
  async finishCost(event: CostEvent) {
    await this.query("UPDATE cost_events SET body=? WHERE id=?", [
      JSON.stringify(event),
      event.id,
    ]);
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
}
