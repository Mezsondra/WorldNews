import { Store } from "./db.js";
import { startWorker } from "./worker.js";
import { startResearchWorker } from "./research.js";
const store = new Store(process.env.DATABASE_URL);
await store.init();
startWorker(store);
startResearchWorker(store);
console.log(
  "World News render and research workers started; concurrency: 1 each.",
);
