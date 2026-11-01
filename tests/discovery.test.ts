import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/db.js";
import { newStory } from "../server/domain.js";
import {
  buildLeads,
  canonical,
  parseFeed,
  pollFeeds,
} from "../server/discovery.js";
import type { FeedItem } from "../shared/types.js";

const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Desk</title>
<item><title><![CDATA[Flooding forces evacuations in Valencia region]]></title>
<link>https://news.example.org/a?utm_source=rss#top</link>
<description>&lt;p&gt;Thousands &lt;b&gt;moved&lt;/b&gt;.&lt;/p&gt;</description>
<pubDate>Sun, 01 Nov 2026 08:00:00 GMT</pubDate></item>
<item><title>No link here</title></item>
<item><title>Private link</title><link>http://127.0.0.1/x</link></item>
</channel></rss>`;
const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
<title>Valencia flooding: evacuations widen</title>
<link rel="alternate" href="https://other.example.com/b"/>
<updated>2026-11-01T09:00:00Z</updated><summary>Update</summary></entry></feed>`;
const rdf = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<item><title>Central bank holds rates</title><link>https://third.example.net/c</link><dc:date>2026-11-01T07:00:00Z</dc:date></item></rdf:RDF>`;

test("feeds: RSS, Atom and RDF items parse; unsafe or incomplete links are skipped", () => {
  const seen = "2026-11-01T10:00:00.000Z";
  const [a, ...rest] = parseFeed(rss, "Desk", seen);
  assert.equal(rest.length, 0);
  assert.equal(a.title, "Flooding forces evacuations in Valencia region");
  assert.equal(a.url, "https://news.example.org/a");
  assert.equal(a.summary, "Thousands moved.");
  assert.equal(a.publishedAt, "2026-11-01T08:00:00.000Z");
  const [b] = parseFeed(atom, "Other", seen);
  assert.equal(b.url, "https://other.example.com/b");
  assert.equal(b.publishedAt, "2026-11-01T09:00:00.000Z");
  const [c] = parseFeed(rdf, "Third", seen);
  assert.equal(c.url, "https://third.example.net/c");
  assert.equal(c.publishedAt, "2026-11-01T07:00:00.000Z");
  assert.equal(
    canonical("https://x.org/p?id=1&utm_medium=rss#h"),
    "https://x.org/p?id=1",
  );
});

const item = (
  title: string,
  feed: string,
  hoursAgo: number,
  url = "",
): FeedItem => {
  const at = new Date(
    Date.parse("2026-11-01T12:00:00Z") - hoursAgo * 3_600_000,
  ).toISOString();
  return {
    id: crypto.randomUUID(),
    url: url || `https://${feed}.example/${encodeURIComponent(title)}`,
    title,
    summary: "",
    publishedAt: at,
    seenAt: at,
    feed,
  };
};

test("leads: group related headlines, rank by feed count, drop stale, match stories", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  const items = [
    item("Valencia flooding forces evacuations", "a", 1),
    item("Evacuations widen as Valencia flooding spreads", "b", 2),
    item("Valencia flooding: evacuations ordered", "a", 3),
    item("Central bank holds interest rates", "c", 0.5),
    item("Old summit communique released", "d", 100),
    item(
      "Election count delayed in Malawi",
      "e",
      4,
      "https://e.example/malawi",
    ),
    item("Malawi election count delayed again", "f", 2),
  ];
  const covered = newStory("Malawi election count delayed");
  covered.sources.push({ url: "https://e.example/malawi" } as any);
  const leads = buildLeads(items, [covered], now);
  assert.deepEqual(
    leads.map((l) => [l.feeds, l.items.length]),
    [
      [2, 3],
      [2, 2],
      [1, 1],
    ],
  );
  assert.equal(leads[0].title, "Valencia flooding forces evacuations");
  assert.equal(leads[1].story?.id, covered.id);
  assert.equal(leads[1].story?.newItems, 1);
  assert.match(leads[2].warnings[0], /Only one feed/);
  assert.ok(!leads.some((l) => l.title.includes("summit")));
  // A lead fully contained in a story is not repeated.
  covered.sources.push({ url: items[6].url } as any);
  assert.equal(buildLeads(items, [covered], now).length, 2);
});

test("polling: claims each feed once per interval, records errors, dedupes and removes items", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "worldnews-feeds-"));
  const store = new Store(undefined, path.join(dir, "db.sqlite"));
  try {
    await store.init();
    await store.addFeed({
      url: "https://news.example.org/rss",
      name: "Desk",
      addedAt: "",
    });
    await store.addFeed({
      url: "https://down.example.org/rss",
      name: "Down",
      addedAt: "",
    });
    await assert.rejects(
      store.addFeed({
        url: "https://news.example.org/rss",
        name: "Dup",
        addedAt: "",
      }),
      /already registered/,
    );
    let calls = 0;
    const fetchFeed = async (url: string) => {
      calls++;
      if (url.includes("down")) throw new Error("Source returned HTTP 503.");
      return rss;
    };
    const now = Date.parse("2026-11-01T10:00:00Z");
    await Promise.all([
      pollFeeds(store, fetchFeed, now),
      pollFeeds(store, fetchFeed, now),
    ]);
    assert.equal(calls, 2);
    await pollFeeds(store, fetchFeed, now + 60_000);
    assert.equal(calls, 2, "not due yet");
    await pollFeeds(store, fetchFeed, now + 16 * 60_000);
    assert.equal(calls, 4);
    const feeds = await store.feeds();
    assert.equal(
      feeds.find((f) => f.name === "Down")?.error,
      "Source returned HTTP 503.",
    );
    assert.equal(feeds.find((f) => f.name === "Desk")?.itemCount, 1);
    const items = await store.feedItems("2026-01-01");
    assert.equal(items.length, 1);
    await store.dismissFeedItems([items[0].id]);
    assert.equal((await store.feedItems("2026-01-01")).length, 0);
    await store.removeFeed("https://news.example.org/rss");
    assert.deepEqual(
      (await store.feeds()).map((f) => f.name),
      ["Down"],
    );
  } finally {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
