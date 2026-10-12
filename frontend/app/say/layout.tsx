import { HeaderAccentPicker } from "@/components/accent-picker";
import { AccountControl } from "@/components/account/account-control";
import { HeaderSearch } from "@/components/search/header-search";
import { SearchShell } from "@/components/search/search-shell";
import { ThemeToggle } from "@/components/theme-toggle";

// Above the [slug] segment, so the header stays put while loading.tsx shows a
// new search's skeleton, and stays usable when error.tsx replaces the page.
export default function SearchLayout({ children }: LayoutProps<"/say">) {
  return (
    <SearchShell
      search={<HeaderSearch accent={<HeaderAccentPicker />} />}
      theme={<ThemeToggle />}
      account={<AccountControl />}
    >
      {children}
    </SearchShell>
  );
}
