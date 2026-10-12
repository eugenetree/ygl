import { cn } from "@/lib/utils";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "border-t px-[max(24px,calc((100%-912px)/2))] py-5 text-[13px] text-muted-foreground",
        className,
      )}
    >
      © 2026 saythis.co
    </footer>
  );
}
