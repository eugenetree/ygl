import { z } from "zod";

export const validationErrorSchema = z.object({
  code: z.literal("VALIDATION_ERROR"),
  message: z.string(),
  issues: z.array(z.object({ field: z.string(), message: z.string() })),
});

export const errorSchema = z.object({
  code: z.enum(["NOT_FOUND", "SEARCH_UNAVAILABLE", "INTERNAL_ERROR"]),
  message: z.string(),
});

export const errorSchemaFor = <
  Code extends z.infer<typeof errorSchema>["code"],
>(
  code: Code,
) => errorSchema.extend({ code: z.literal(code) });

export const errorResponseSchema = z.discriminatedUnion("code", [
  validationErrorSchema,
  errorSchema,
]);

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type ErrorCode = ErrorResponse["code"];
