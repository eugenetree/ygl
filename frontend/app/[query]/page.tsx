import type { Metadata } from "next";
import GentleResults from "../components/GentleResults";

type Params = Promise<{ query: string }>;

// Next leaves dynamic segments percent-encoded, so "a b" arrives as "a%20b".
async function decodedQuery(params: Params): Promise<string> {
  const { query } = await params;
  try {
    return decodeURIComponent(query);
  } catch {
    return query;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const query = await decodedQuery(params);
  return { title: `saythis — ${query}` };
}

export default async function Page({ params }: { params: Params }) {
  const query = await decodedQuery(params);
  return <GentleResults key={query} query={query} />;
}
