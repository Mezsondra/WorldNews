import { Store } from "./db.js";
import { startWorker } from "./worker.js";
const store = new Store(process.env.DATABASE_URL);
await store.init();
startWorker(store);
console.log("World News render worker started; concurrency: 1.");
