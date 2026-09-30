import type { SearchUnavailableError } from "../captions-search/captions.service.js";
import type { ErrorResponse } from "./contract/index.js";

type KnownFailure = SearchUnavailableError;

const FAILURE_RESPONSES: {
  [Type in KnownFailure["type"]]: { status: number; body: ErrorResponse };
} = {
  SEARCH_UNAVAILABLE: {
    status: 503,
    body: {
      code: "SEARCH_UNAVAILABLE",
      message: "Search is unavailable right now, try again later.",
    },
  },
};

export class RouteFailure extends Error {
  constructor(readonly failure: KnownFailure) {
    super(`Route failed with ${failure.type}`);
  }

  get response() {
    return FAILURE_RESPONSES[this.failure.type];
  }
}
