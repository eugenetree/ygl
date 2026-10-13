import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { withCurrentAccent } from "@/lib/accent";
import { resolveSearchPath } from "@/lib/search-actions";

/**
 * Submits a search form whose input is named "q" to its search page, in the
 * current accent. Pending until the search page shows.
 */
export function useSearchSubmit() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get("q");
    if (typeof query !== "string" || !query.trim()) return;
    startTransition(async () => {
      const path = await resolveSearchPath(query);
      // An update after an await leaves the transition unless it starts
      // another, and then the navigation wouldn't count as pending.
      if (path) startTransition(() => router.push(withCurrentAccent(path)));
    });
  }

  return { handleSubmit, isPending };
}
