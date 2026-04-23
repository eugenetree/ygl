import type { Metadata } from "next";
import GentleResults from "../components/GentleResults";

type Params = Promise<{ query: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { query } = await params;
  return { title: `saythis — ${query}` };
}

export default async function Page({ params }: { params: Params }) {
  const { query } = await params;
  return <GentleResults key={query} query={query} />;
}
