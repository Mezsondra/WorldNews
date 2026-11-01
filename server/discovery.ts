import * as cheerio from "cheerio";
import type { Discovery, FeedItem, Lead, Story } from "../shared/types.js";
import type { Store } from "./db.js";
import { id } from "./domain.js";
import { retrieveFeed, validateUrl } from "./fetcher.js";

export const pollMinutes = Math.max(
  5,
  Number(process.env.DISCOVERY_POLL_MINUTES) || 15,
);
const HOUR = 3_600_000,
  WINDOW = 72 * HOUR,
  RETAIN = 14 * 24 * HOUR;

const clean = (value: string, max: number) =>
  cheerio.load(value).text().replace(/\s+/g, " ").trim().slice(0, max);
const isoDate = (value: string) => {
  const t = Date.parse(value);
  return Number.isNaN(t) ? "" : new Date(t).toISOString();
};
// Feed links often carry tracking parameters; compare without them.
export function canonical(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|at_|cmp|ito|ns_)/i.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch {
    return value;
  }
}

// RSS 2.0, RSS 1.0 (RDF) and Atom.
export function parseFeed(xml: string, feed: string, seenAt: string) {
  const $ = cheerio.load(xml, { xml: true });
  const items: FeedItem[] = [];
  $("item, entry")
    .slice(0, 50)
    .each((_, el) => {
      const node = $(el);
      const link =
        node.children("link[rel='alternate']").attr("href") ||
        node.children("link").first().attr("href") ||
        node.children("link").first().text().trim();
      const title = clean(node.children("title").first().text(), 300);
      if (!link || !title) return;
      try {
        validateUrl(link);
      } catch {
        return;
      }
      items.push({
        id: id(),
        url: canonical(link),
        title,
        summary: clean(
          node.children("description, summary, content").first().text(),
          400,
        ),
        publishedAt: isoDate(
          node
            .children("pubDate, published, updated, dc\\:date")
            .first()
            .text()
            .trim(),
        ),
        seenAt,
        feed,
      });
    });
  return items;
}

const STOP = new Set(
  "the and for with from that this into over after amid says said will have has are was were not but its their his her they who what when where why how new news live update updates video watch more than about been also could would after before".split(
    " ",
  ),
);
export const words = (text: string) =>
  new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(
      (w) => w.length > 2 && !STOP.has(w),
    ),
  );
// ponytail: headline word overlap; swap for embeddings if paraphrased coverage goes ungrouped
const similar = (a: Set<string>, b: Set<string>) => {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared >= 2 && shared / Math.min(a.size, b.size) >= 0.5;
};

export function buildLeads(items: FeedItem[], stories: Story[], now: number) {
  const dated = items
    .map((item) => ({
      item,
      at: Date.parse(item.publishedAt || item.seenAt),
      words: words(item.title),
    }))
    .filter((x) => x.at >= now - WINDOW)
    .sort((a, b) => b.at - a.at);
  // ponytail: O(n²) single-linkage grouping; fine for a few hundred items per window
  const groups: (typeof dated)[] = [];
  for (const x of dated) {
    const group = groups.find((g) => g.some((y) => similar(x.words, y.words)));
    if (group) group.push(x);
    else groups.push([x]);
  }
  const open = stories
    .filter((s) => s.stage !== "rejected")
    .map((s) => ({
      story: s,
      urls: new Set(s.sources.map((src) => canonical(src.url))),
      words: words(s.title),
    }));
  const leads: Lead[] = [];
  for (const group of groups) {
    const lead: Lead = {
      id: group[0].item.id,
      title: group[0].item.title,
      items: group.map((x) => x.item),
      feeds: new Set(group.map((x) => x.item.feed)).size,
      latestAt: new Date(group[0].at).toISOString(),
      warnings: [],
    };
    if (lead.feeds === 1)
      lead.warnings.push("Only one feed so far; not yet seen elsewhere.");
    if (lead.items.some((i) => !i.publishedAt))
      lead.warnings.push(
        "Some items have no publication date; using the time first seen.",
      );
    if (group.some((x) => x.at > now + HOUR))
      lead.warnings.push(
        "A publication date is in the future; check the feed.",
      );
    const match = open.find(
      (o) =>
        lead.items.some((i) => o.urls.has(i.url)) ||
        group.some((x) => similar(x.words, o.words)),
    );
    if (match) {
      const newItems = lead.items.filter((i) => !match.urls.has(i.url)).length;
      if (!newItems) continue; // everything is already in that story
      lead.story = { id: match.story.id, title: match.story.title, newItems };
    }
    leads.push(lead);
  }
  return leads
    .sort((a, b) => b.feeds - a.feeds || b.latestAt.localeCompare(a.latestAt))
    .slice(0, 40);
}

export async function discovery(store: Store): Promise<Discovery> {
  const now = Date.now();
  return {
    feeds: (await store.feeds()).map(({ polledAt: _, ...feed }) => feed),
    leads: buildLeads(
      await store.feedItems(new Date(now - RETAIN).toISOString()),
      await store.list(),
      now,
    ),
    pollMinutes,
  };
}

export async function pollFeeds(
  store: Store,
  fetchFeed: (url: string) => Promise<string> = retrieveFeed,
  now = Date.now(),
) {
  for (const feed of await store.feeds()) {
    if (feed.polledAt > now - pollMinutes * 60_000) continue;
    if (!(await store.claimFeed(feed.url, feed.polledAt, now))) continue;
    try {
      const items = parseFeed(
        await fetchFeed(feed.url),
        feed.name,
        new Date(now).toISOString(),
      );
      await store.addFeedItems(feed.url, items);
      feed.itemCount = items.length;
      delete feed.error;
    } catch (error) {
      feed.error = error instanceof Error ? error.message : "Feed failed.";
    }
    feed.lastPolledAt = new Date(now).toISOString();
    await store.updateFeed(feed);
  }
  await store.pruneFeedItems(new Date(now - RETAIN).toISOString());
}

export function startDiscoveryWorker(store: Store) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await pollFeeds(store);
    } catch (error) {
      console.error(
        "Discovery error:",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 60_000);
  void tick();
  return () => clearInterval(timer);
}
