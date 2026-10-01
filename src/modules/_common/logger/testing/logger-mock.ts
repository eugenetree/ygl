import { mock } from "node:test";

/** Its children share its mocks, so what a child logs is seen here. */
export function createLoggerMock() {
  const logger = {
    setContext: mock.fn(),
    info: mock.fn((_message: string) => {}),
    warn: mock.fn(),
    error: mock.fn((_entry: { message?: string; error?: unknown }) => {}),
  };
  return { ...logger, child: () => logger };
}
