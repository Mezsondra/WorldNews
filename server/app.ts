import express from "express";
import { timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { Store, dataDir } from "./db.js";
import {
  gates,
  productionGates,
  id,
  invalidate,
  newStory,
  now,
} from "./domain.js";
import { retrieve } from "./fetcher.js";
import { sourcePage } from "./source-page.js";
import type { Story, Job } from "../shared/types.js";
import {
  claudeAssist,
  validateDraft,
  pilotStatus,
  voiceLabel,
} from "./providers.js";

const short = z.string().trim().max(500),
  text = z.string().trim().max(5000),
  identifier = z.string().min(1).max(80);
const evidence = z.object({
  sourceId: identifier,
  passage: z.string().trim().min(1).max(2000),
  relation: z.enum(["supports", "contradicts"]),
  translation: text.optional(),
});
const claim = z.object({
  id: identifier,
  text: text.min(1),
  status: z.enum([
    "supported fact",
    "attributed statement",
    "allegation",
    "analysis",
    "disputed",
    "insufficient evidence",
  ]),
  evidence: z.array(evidence).max(15),
});
const segment = z.object({
  id: identifier,
  text: z.string().trim().min(1).max(900),
  claimIds: z.array(identifier).min(1).max(10),
  assetId: identifier.optional(),
});
const edit = z.object({
  version: z.number().int().positive(),
  title: short.min(1).max(140),
  summary: z.string().max(220),
  category: short,
  region: short,
  eventAt: short,
  claims: z.array(claim).max(40),
  segments: z.array(segment).max(20),
  pronunciations: z
    .record(z.string().min(1).max(80), z.string().min(1).max(80))
    .optional(),
});
const fail = (message: string, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
export function createApp(store: Store) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws://localhost:* ws://127.0.0.1:*; frame-ancestors 'none'",
    });
    next();
  });
  app.use((req, res, next) => {
    const allowed = [
      "localhost",
      "127.0.0.1",
      "[::1]",
      ...(process.env.ALLOWED_HOSTS || "").split(",").filter(Boolean),
    ];
    if (process.env.PUBLIC_BASE_URL)
      allowed.push(new URL(process.env.PUBLIC_BASE_URL).hostname);
    if (!allowed.includes(req.hostname))
      return res
        .status(403)
        .send("Unknown host. Configure ALLOWED_HOSTS for this deployment.");
    next();
  });
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/s/:id", async (req, res) => {
    if (!/^[a-f0-9-]{8,36}$/.test(req.params.id)) return res.sendStatus(404);
    const matches = (await store.list()).filter(
      (s) => s.id === req.params.id || s.id.slice(0, 8) === req.params.id,
    );
    if (matches.length !== 1) return res.sendStatus(404);
    const requested = req.query.v ? Number(req.query.v) : undefined;
    if (
      requested !== undefined &&
      (!Number.isInteger(requested) || requested < 1)
    )
      return res.sendStatus(400);
    const approved = await store.approved(matches[0].id, requested);
    if (!approved)
      return res
        .status(404)
        .send(
          "No approved source record. Use the authenticated draft preview in the editorial desk.",
        );
    res
      .set("Cache-Control", "no-store")
      .type("html")
      .send(sourcePage(approved, false, matches[0].corrections));
  });
  const attempts = new Map<string, { count: number; until: number }>();
  app.use((req, res, next) => {
    const password = process.env.DASHBOARD_PASSWORD;
    if (!password) return next();
    const ip = req.ip || "unknown",
      entry = attempts.get(ip);
    if (entry && entry.count >= 20 && entry.until > Date.now())
      return res.status(429).send("Too many login attempts. Try again later.");
    let supplied = "";
    try {
      const decoded = Buffer.from(
        (req.headers.authorization || "").replace(/^Basic /, ""),
        "base64",
      ).toString();
      supplied = decoded.slice(decoded.indexOf(":") + 1);
    } catch {}
    const valid =
      Buffer.byteLength(supplied) === Buffer.byteLength(password) &&
      timingSafeEqual(Buffer.from(supplied), Buffer.from(password));
    if (!valid) {
      attempts.set(ip, {
        count: entry && entry.until > Date.now() ? entry.count + 1 : 1,
        until: Date.now() + 600000,
      });
      res.set(
        "WWW-Authenticate",
        'Basic realm="World News editorial desk", charset="UTF-8"',
      );
      return res.status(401).send("Dashboard authentication required.");
    }
    attempts.delete(ip);
    next();
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers["sec-fetch-site"] === "cross-site")
        return res
          .status(403)
          .json({ error: "Cross-site requests are blocked." });
      const origin = req.headers.origin;
      if (
        origin &&
        ![
          `${req.protocol}://${req.headers.host}`,
          "http://localhost:5173",
          "http://127.0.0.1:5173",
        ].includes(origin)
      )
        return res
          .status(403)
          .json({ error: "Request origin is not allowed." });
      if (!req.is("application/json"))
        return res.status(415).json({ error: "Use application/json." });
    }
    next();
  });
  app.use(express.json({ limit: "13mb" }));
  app.use(
    "/media/renders",
    express.static(path.join(dataDir, "renders"), {
      dotfiles: "deny",
      index: false,
    }),
  );
  app.use(
    "/media/assets",
    express.static(path.join(dataDir, "assets"), {
      dotfiles: "deny",
      index: false,
    }),
  );
  app.use("/media", (_req, res) => res.sendStatus(404));
  const get = async (value: string | string[]) => {
    const story = await store.get(String(value));
    if (!story) fail("Story not found.", 404);
    return story!;
  };
  const version = (story: Story, v: number) => {
    if (story.version !== v)
      fail("This story changed. Refresh before continuing.", 409);
  };
  async function replace(old: Story, next: Story) {
    await store.snapshot(old);
    await store.save(next, old.version);
    await store.cancelJobs(old.id);
    await store.audit("content-edited", {
      storyId: old.id,
      previousVersion: old.version,
      version: next.version,
    });
    return next;
  }
  app.get("/api/overview", async (_req, res) => {
    const stories = await store.list();
    res.json({
      stories,
      jobs: await store.jobs(),
      settings: await store.settings(),
      storage: process.env.DATABASE_URL
        ? "PostgreSQL"
        : "SQLite · local development",
      voice: voiceLabel(),
      pilot: await pilotStatus(store),
      publishing: "Export only · accounts not connected",
      gates: Object.fromEntries(stories.map((s) => [s.id, gates(s)])),
    });
  });
  app.post("/api/stories", async (req, res) => {
    const input = z
      .object({
        title: short.min(1).max(140),
        url: z.string().url().optional(),
      })
      .parse(req.body);
    const story = newStory(input.title);
    if (input.url) story.sources.push(await retrieve(input.url));
    await store.create(story);
    await store.audit("story-created", { id: story.id });
    res.status(201).json(story);
  });
  app.get("/api/stories/:id", async (req, res) =>
    res.json(await get(req.params.id)),
  );
  app.get("/api/stories/:id/ai-reports", async (req, res) =>
    res.json(await store.reports(String(req.params.id))),
  );
  app.post("/api/stories/:id/assist", async (req, res) => {
    const input = z
      .object({
        version: z.number().int(),
        kind: z.enum(["research", "draft"]),
      })
      .parse(req.body);
    const old = await get(req.params.id);
    version(old, input.version);
    if (["held", "rejected", "producing"].includes(old.stage))
      fail("Resume research or finish the active render first.", 422);
    const result = await claudeAssist(store, old, input.kind);
    const current = await get(old.id);
    version(current, input.version);
    if (input.kind === "draft") {
      const draft = validateDraft(current, result);
      if (draft.outcome === "draft") {
        const next = invalidate({
          ...current,
          summary: draft.summary,
          claims: draft.claims.map((c) => ({ ...c, reviewed: false })),
          segments: draft.segments,
        });
        res.json({ story: await replace(current, next), report: result });
        return;
      }
    }
    res.json({ story: current, report: result });
  });
  app.put("/api/stories/:id", async (req, res) => {
    const input = edit.parse(req.body),
      old = await get(req.params.id);
    version(old, input.version);
    if (
      new Set(input.claims.map((c) => c.id)).size !== input.claims.length ||
      new Set(input.segments.map((s) => s.id)).size !== input.segments.length
    )
      fail("Claim and segment IDs must be unique.");
    const next = invalidate({
      ...old,
      ...input,
      claims: input.claims.map((c) => ({ ...c, reviewed: false })),
      pronunciations: input.pronunciations || old.pronunciations,
    });
    res.json(await replace(old, next));
  });
  app.post("/api/stories/:id/sources", async (req, res) => {
    const input = z
      .object({ version: z.number().int(), url: z.string().url() })
      .parse(req.body);
    const old = await get(req.params.id);
    version(old, input.version);
    const source = await retrieve(input.url);
    const fresh = await get(old.id);
    version(fresh, input.version);
    const duplicate = fresh.sources.find((s) => s.url === source.url);
    if (duplicate)
      fail("This source is already attached. Use recheck to update it.");
    res.json(
      await replace(
        fresh,
        invalidate({ ...fresh, sources: [...fresh.sources, source] }),
      ),
    );
  });
  app.patch("/api/stories/:id/sources/:sourceId", async (req, res) => {
    const input = z
      .object({
        version: z.number().int(),
        publisher: short.min(1),
        author: short,
        publishedAt: short,
        lineage: short.min(1),
        kind: z.enum(["primary", "secondary"]),
        language: z.string().min(2).max(10),
      })
      .parse(req.body);
    const old = await get(req.params.id);
    version(old, input.version);
    const source = old.sources.find((s) => s.id === req.params.sourceId);
    if (!source) fail("Source not found.", 404);
    const { version: _v, ...fields } = input;
    res.json(
      await replace(
        old,
        invalidate({
          ...old,
          sources: old.sources.map((s) =>
            s.id === source!.id ? { ...s, ...fields } : s,
          ),
        }),
      ),
    );
  });
  app.post("/api/stories/:id/recheck", async (req, res) => {
    const input = z
      .object({ version: z.number().int(), sourceId: identifier })
      .parse(req.body);
    const old = await get(req.params.id);
    version(old, input.version);
    const source = old.sources.find((s) => s.id === input.sourceId);
    if (!source) fail("Source not found.", 404);
    const fresh = await retrieve(source!.url);
    const current = await get(old.id);
    version(current, input.version);
    if (fresh.hash === source!.hash) {
      res.json({ changed: false, story: current });
      return;
    }
    const next = invalidate({
      ...current,
      sources: current.sources.map((s) =>
        s.id === source!.id
          ? {
              ...s,
              text: fresh.text,
              hash: fresh.hash,
              retrievedAt: fresh.retrievedAt,
            }
          : s,
      ),
    });
    res.json({ changed: true, story: await replace(current, next) });
  });
  app.post("/api/stories/:id/review", async (req, res) => {
    const input = z
      .object({
        version: z.number().int(),
        claimId: identifier,
        reviewed: z.boolean(),
      })
      .parse(req.body);
    const story = await get(req.params.id);
    version(story, input.version);
    const c = story.claims.find((c) => c.id === input.claimId);
    if (!c) fail("Claim not found.", 404);
    if (story.approval) fail("Edit the story to reopen evidence review.");
    c!.reviewed = input.reviewed;
    await store.save(story, story.version);
    await store.audit("claim-reviewed", {
      storyId: story.id,
      claimId: c!.id,
      reviewed: input.reviewed,
    });
    res.json(story);
  });
  app.post("/api/stories/:id/render", async (req, res) => {
    const input = z.object({ version: z.number().int() }).parse(req.body);
    const story = await get(req.params.id);
    version(story, input.version);
    const issues = productionGates(story);
    if (issues.length)
      return res
        .status(422)
        .json({ error: "Editorial checks need attention.", gates: issues });
    if (story.renders.some((r) => r.version === story.version))
      fail("This version is already rendered. Edit content to regenerate.");
    const active = (await store.jobs()).find(
      (j) =>
        j.storyId === story.id &&
        j.version === story.version &&
        ["queued", "running"].includes(j.status),
    );
    if (active) return res.status(202).json(active);
    const job: Job = {
      id: id(),
      storyId: story.id,
      version: story.version,
      status: "queued",
      progress: "Waiting for render worker",
      attempts: 0,
      lease: 0,
      createdAt: now(),
    };
    await store.addJob(job);
    story.stage = "producing";
    await store.save(story, story.version);
    await store.snapshot(story);
    res.status(202).json(job);
  });
  app.post("/api/stories/:id/approve", async (req, res) => {
    const input = z
      .object({
        version: z.number().int(),
        editor: z.string().trim().min(2).max(80),
        destinations: z
          .array(z.enum(["Instagram", "YouTube", "X", "TikTok"]))
          .min(1),
        previewChecked: z.literal(true),
        captionsChecked: z.boolean().optional(),
      })
      .parse(req.body);
    const story = await get(req.params.id);
    version(story, input.version);
    if (gates(story).length)
      fail("Resolve editorial checks before approval.", 422);
    if (!story.renders.some((r) => r.version === story.version))
      fail("Render and inspect this exact version first.", 422);
    if (
      story.renders.find((r) => r.version === story.version)?.captionWarnings
        ?.length &&
      !input.captionsChecked
    )
      fail(
        "Review caption differences and explicitly confirm the caption check before approval.",
        422,
      );
    story.approval = {
      version: story.version,
      destinations: [...new Set(input.destinations)],
      editor: input.editor,
      at: now(),
    };
    story.stage = "approved";
    await store.save(story, story.version);
    await store.approveSnapshot(story);
    await store.audit("export-approved", {
      storyId: story.id,
      ...story.approval,
    });
    res.json(story);
  });
  app.post("/api/stories/:id/stage", async (req, res) => {
    const input = z
      .object({
        version: z.number().int(),
        stage: z.enum(["held", "rejected", "researching"]),
      })
      .parse(req.body);
    const old = await get(req.params.id);
    version(old, input.version);
    const next = invalidate(old);
    next.stage = input.stage;
    res.json(await replace(old, next));
  });
  app.post("/api/stories/:id/corrections", async (req, res) => {
    const input = z
      .object({ version: z.number().int(), text: text.min(5) })
      .parse(req.body);
    const old = await get(req.params.id);
    version(old, input.version);
    const next = invalidate(old);
    next.corrections.push({
      at: now(),
      text: input.text,
      version: next.version,
    });
    res.json(await replace(old, next));
  });
  app.post("/api/stories/:id/assets", async (req, res) => {
    const input = z
      .object({
        version: z.number().int(),
        image: z.string().max(12_000_000),
        creator: short.min(1),
        permission: short.min(1),
        provenance: z.string().url(),
        eventDate: short.min(1),
        location: short.min(1),
        archive: z.boolean(),
        context: short.min(1),
      })
      .parse(req.body);
    const old = await get(req.params.id);
    version(old, input.version);
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(input.image))
      fail("Upload a PNG, JPEG or WebP image.");
    const assetId = id(),
      file = `assets/${old.id}/${assetId}.png`;
    await mkdir(path.dirname(path.join(dataDir, file)), { recursive: true });
    const bytes = Buffer.from(input.image.split(",")[1], "base64");
    await sharp(bytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
      .png()
      .toFile(path.join(dataDir, file));
    const { image: _image, version: _v, ...metadata } = input;
    const current = await get(old.id);
    version(current, input.version);
    res.json(
      await replace(
        current,
        invalidate({
          ...current,
          assets: [...current.assets, { id: assetId, file, ...metadata }],
        }),
      ),
    );
  });
  app.get("/api/stories/:id/source-page", async (req, res) =>
    res.type("html").send(sourcePage(await get(req.params.id), true)),
  );
  app.get("/api/stories/:id/history", async (req, res) =>
    res.json(await store.history(String(req.params.id))),
  );
  app.post("/api/settings", async (req, res) => {
    const input = z.object({ paused: z.boolean() }).parse(req.body);
    await store.setSettings(input);
    await store.audit("publication-pause", input);
    res.json(input);
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof z.ZodError)
        return res.status(400).json({
          error: err.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
      res
        .status(err.status || 400)
        .json({ error: err.message || "Request failed." });
    },
  );
  return app;
}
