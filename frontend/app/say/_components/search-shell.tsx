import {
  HeaderSlot,
  HeaderSlotProvider,
} from "@/app/say/_components/header-slot";
import { SiteFooter, SiteHeader } from "@/components/site-frame";

/**
 * A search page's frame: the header, then the page, then the footer.
 *
 * In the side-list layout the header is sticky and blurred; otherwise it
 * scrolls away. The page's `InHeader` content sits before `theme` and
 * `account` at the header's right end.
 */
export function SearchShell({
  search,
  theme,
  account,
  children,
}: {
  search: React.ReactNode;
  theme: React.ReactNode;
  account: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <HeaderSlotProvider>
      <div className="flex min-h-dvh flex-col">
        <SiteHeader className="side:sticky side:top-0 side:z-20 side:bg-header side:backdrop-blur-[8px]">
          {search}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <HeaderSlot />
            {theme}
            {account}
          </div>
        </SiteHeader>
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
    </HeaderSlotProvider>
  );
}
