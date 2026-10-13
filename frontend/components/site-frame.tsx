import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

// The search page's content is at most 1232px wide on desktop, so every page's
// header and footer line up with it.
const GUTTERS =
  "px-4 sm:px-[max(20px,calc((100%-1232px)/2))] side:px-[max(24px,calc((100%-1232px)/2))]";

export function SiteHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <header
      className={cn(
        "flex h-14 shrink-0 items-center gap-2.5 border-b sm:gap-3.5 side:gap-4",
        GUTTERS,
        className,
      )}
    >
      <Logo />
      {children}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer
      className={cn("border-t py-5 text-[13px] text-muted-foreground", GUTTERS)}
    >
      © 2026 saythis.co
    </footer>
  );
}
