import { beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { Failure, Success } from "../../../types/index.js";
import { ProcessScraperFailureUseCase } from "./process-scraper-failure.use-case.js";
import { Logger } from "../../_common/logger/logger.js";
import { TelegramNotifier } from "../../telegram/telegram-notifier.js";

// ---- Factory ----------------------------------------------------------------

function createMocks() {
  return {
    logger: {
      setContext: mock.fn<Logger["setContext"]>(),
      info: mock.fn<Logger["info"]>(),
      error: mock.fn<Logger["error"]>(),
      warn: mock.fn<Logger["warn"]>(),
    },
    telegramNotificationService: {
      sendMessage: mock.fn<TelegramNotifier["sendMessage"]>(),
    },
  };
}

function buildSut(mocks: ReturnType<typeof createMocks>) {
  return new ProcessScraperFailureUseCase(
    mocks.logger as unknown as Logger,
    mocks.telegramNotificationService as unknown as TelegramNotifier,
  );
}

// ---- Tests ------------------------------------------------------------------

describe("ProcessScraperFailureUseCase", () => {
  let mocks: ReturnType<typeof createMocks>;
  let sut: ProcessScraperFailureUseCase;

  beforeEach(() => {
    mocks = createMocks();
    mocks.telegramNotificationService.sendMessage.mock.mockImplementation(() =>
      Promise.resolve(Success(undefined)),
    );
    sut = buildSut(mocks);
  });

  it("calls sendMessage with formatted message containing scraper name and error", async () => {
    const error = { type: "DATABASE" as const, message: "connection lost" };

    await sut.execute({ scraperName: "VIDEO", error });

    assert.equal(mocks.telegramNotificationService.sendMessage.mock.callCount(), 1);
    const message = mocks.telegramNotificationService.sendMessage.mock.calls[0]!.arguments[0];
    assert.ok(message.includes("VIDEO"));
    assert.ok(message.includes("DATABASE"));
  });

  it("returns Success even when Telegram delivery fails", async () => {
    mocks.telegramNotificationService.sendMessage.mock.mockImplementation(() =>
      Promise.resolve(Failure({ type: "TELEGRAM_NOTIFICATION_ERROR" as const, cause: "timeout" })),
    );

    const error = { type: "FETCH_ERROR" as const, kind: "NETWORK" };
    const result = await sut.execute({ scraperName: "CHANNEL", error });

    assert.equal(result.ok, true);
  });

  it("logs a warning when Telegram delivery fails", async () => {
    mocks.telegramNotificationService.sendMessage.mock.mockImplementation(() =>
      Promise.resolve(Failure({ type: "TELEGRAM_NOTIFICATION_ERROR" as const, cause: "timeout" })),
    );

    const error = { type: "FETCH_ERROR" as const, kind: "NETWORK" };
    await sut.execute({ scraperName: "CHANNEL", error });

    assert.equal(mocks.logger.error.mock.callCount(), 1);
    const loggedMessage = mocks.logger.error.mock.calls[0]!.arguments[0];
    assert.ok(
      typeof loggedMessage === "object" &&
      "message" in loggedMessage &&
      typeof loggedMessage.message === "string" &&
      loggedMessage.message.includes("Telegram"),
    );
  });
});
