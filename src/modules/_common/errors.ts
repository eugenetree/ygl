export type BaseError = Record<string, unknown> & {
  type: string;
}