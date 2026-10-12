import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";

/** A search page's frame: the header with its search form, then the footer. */
export function SearchShell({
  search,
  children,
}: {
  search: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b px-[max(16px,calc((100%-912px)/2))] sm:px-[max(24px,calc((100%-912px)/2))]">
        <Logo />
        {search}
      </header>
      <main className="mx-auto w-full max-w-[912px] flex-1 px-2 py-4 sm:px-4 sm:py-6">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
