import { z } from "zod";

// https://github.com/colinhacks/zod/discussions/839#discussioncomment-8142768
export function getZodEnumFromObjectKeys<
  TI extends Record<string, any>,
  R extends string = TI extends Record<infer R, any> ? R : never,
>(input: TI): z.ZodEnum<[R, ...R[]]> {
  const [firstKey, ...otherKeys] = Object.keys(input) as [R, ...R[]];
  return z.enum([firstKey, ...otherKeys]);
}
