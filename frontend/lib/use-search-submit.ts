import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { withCurrentAccent } from "@/lib/accent";
import { resolveSearchPath } from "@/lib/search-actions";

/**
 * Submits a search form whose input is named "q" to its search page, in the
 * current accent.
 */
export function useSearchSubmit() {
  const router = useRouter();

  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get("q");
    if (typeof query !== "string" || !query.trim()) return;
    startTransition(async () => {
      const path = await resolveSearchPath(query);
      if (path) router.push(withCurrentAccent(path));
    });
  };
}
