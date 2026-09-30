// Node loads global setup in the test runner process, which does not get the
// --import tsx that test files get, so TypeScript is loaded through tsx here.
import { require as tsxRequire } from "tsx/cjs/api";

export async function globalSetup() {
  const { startTestServer } = tsxRequire(
    "./start-test-server.ts",
    import.meta.url,
  );
  await startTestServer();
}
