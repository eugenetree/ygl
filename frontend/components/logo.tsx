import Link from "next/link";

export function Logo() {
  return (
    <Link
      href="/"
      aria-label="saythis home"
      className="flex items-center gap-[3px] rounded-sm text-[15px] font-bold tracking-[-0.02em] whitespace-nowrap text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span aria-hidden className="font-medium text-primary">
        [
      </span>
      saythis
      <span aria-hidden className="font-medium text-primary">
        ]
      </span>
    </Link>
  );
}
