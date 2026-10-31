import { Store } from "./db.js";
import { createApp } from "./app.js";
import { startWorker } from "./worker.js";
const host = process.env.HOST || "127.0.0.1",
  port = Number(process.env.PORT || 4310);
if (
  !["127.0.0.1", "localhost", "::1"].includes(host) &&
  (!process.env.DASHBOARD_PASSWORD ||
    process.env.DASHBOARD_PASSWORD.length < 24)
)
  throw new Error(
    "Non-loopback hosting requires DASHBOARD_PASSWORD of at least 24 characters. Put HTTPS in front of the app.",
  );
const store = new Store(process.env.DATABASE_URL);
await store.init();
const stop =
  process.env.WORKER_INLINE === "false" ? () => {} : startWorker(store);
const server = createApp(store).listen(port, host, () =>
  console.log(`World News editorial desk: http://${host}:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stop();
    server.close(() => void store.close().then(() => process.exit()));
  });
