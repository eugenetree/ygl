"use client";

import { SearchMessage } from "@/components/search/search-message";
import { Button } from "@/components/ui/button";

export default function SearchError({ retry }: { retry: () => void }) {
  return (
    <SearchMessage title="Search is unavailable right now">
      <title>Search is unavailable right now · saythis</title>
      <p>Please try again in a moment.</p>
      <Button variant="outline" onClick={() => retry()}>
        Retry
      </Button>
    </SearchMessage>
  );
}
