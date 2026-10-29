// Node loads global setup in the test runner process, which does not get the
// --import tsx that test files get, so TypeScript is loaded through tsx here.
import { require as tsxRequire } from "tsx/cjs/api";

const { startTestElasticsearch } = tsxRequire(
  "./start-test-elasticsearch.ts",
  import.meta.url,
);

let stop;

export async function globalSetup() {
  stop = await startTestElasticsearch();
}

export async function globalTeardown() {
  await stop?.();
}
