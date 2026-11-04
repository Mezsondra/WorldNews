import { Store } from "./db.js";
import { startWorker } from "./worker.js";
import { startResearchWorker } from "./research.js";
import { startDiscoveryWorker } from "./discovery.js";
const store = new Store(process.env.DATABASE_URL);
await store.init();
startWorker(store);
startResearchWorker(store);
startDiscoveryWorker(store);
console.log(
  "World News render, research and feed discovery workers started; concurrency: 1 each.",
);
