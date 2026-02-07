export type ValidationError = {
  type: "VALIDATION_ERROR";
  message?: string;
  error?: unknown;
  cause?: unknown;
  context?: unknown;
};

export type ParsingError = {
  type: "PARSING_ERROR";
  message?: string;
  error?: unknown;
  context?: unknown;
};