"use server";

import { searchPath } from "@/lib/slug";

export async function resolveSearchPath(input: unknown) {
  return typeof input === "string" ? searchPath(input) : null;
}
