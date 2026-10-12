import { Logo } from "@/components/logo";
import {
  HeaderSlot,
  HeaderSlotProvider,
} from "@/components/search/header-slot";
import { SiteFooter } from "@/components/site-footer";

/**
 * A search page's frame: the header, then the page, then the footer.
 *
 * The header has three looks. In the side-list layout it is the sticky,
 * blurred results header. Otherwise it scrolls away: on tablets with a border
 * and the page's `InHeader` content at the right, on phones without either.
 * `theme` and `account` sit at its right end in every look.
 */
export function SearchShell({
  search,
  theme,
  account,
  children,
}: {
  search: React.ReactNode;
  theme?: React.ReactNode;
  account?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <HeaderSlotProvider>
      <div className="flex min-h-dvh flex-col">
        <header className="flex shrink-0 items-center gap-2.5 px-4 py-2 sm:gap-3.5 sm:border-b sm:px-5 sm:py-2.5 side:sticky side:top-0 side:z-20 side:h-14 side:gap-4 side:bg-header side:px-[max(24px,calc((100%-1232px)/2))] side:py-0 side:backdrop-blur-[8px]">
          <Logo />
          {search}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <HeaderSlot />
            {theme}
            {account}
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <SiteFooter className="px-4 sm:px-5 side:px-[max(24px,calc((100%-1232px)/2))]" />
      </div>
    </HeaderSlotProvider>
  );
}
