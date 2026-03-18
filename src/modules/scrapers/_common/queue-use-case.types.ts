import { Result } from "../../../types/index.js";
import { BaseError } from "../../_common/errors.js";

export type QueueProcessingOutcome =
  | { status: "empty" }
  | { status: "processed" };

export type QueueUseCaseResult = Result<QueueProcessingOutcome, BaseError>;
