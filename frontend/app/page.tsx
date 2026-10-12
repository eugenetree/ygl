import { HeroSearch } from "@/components/home/hero-search";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { TryLinks } from "@/components/try-links";
import { YouTubeLogo } from "@/components/youtube-logo";

const STEPS = [
  {
    title: "Type a word or phrase",
    body: "Single words, idioms, or whole sentences.",
  },
  {
    title: "Pick an accent",
    body: "American, British, Australian, Canadian or Irish.",
  },
  {
    title: "Hear it in context",
    body: "Each video starts at the moment it's said. Loop it until it sticks.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-[max(24px,calc((100%-912px)/2))]">
        <Logo />
      </header>

      <main className="flex flex-1 flex-col">
        <section className="flex flex-col items-center gap-6 px-6 pt-[14vh] pb-[72px] max-sm:px-4">
          <div className="flex flex-col items-center gap-2.5 text-center">
            <p className="rounded-full border px-2.5 py-[3px] text-xs font-medium text-sub">
              English · 5 accents
            </p>
            <h1 className="text-[32px] leading-[1.05] font-bold tracking-[-0.035em] text-balance sm:text-[44px]">
              Hear how it's actually said.
            </h1>
            <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-base text-muted-foreground">
              <span>Search</span>
              <span className="inline-flex items-center gap-1 font-semibold tracking-[-0.045em] text-foreground">
                <YouTubeLogo />
                YouTube
              </span>
              <span>captions and jump straight to the moment.</span>
            </p>
          </div>

          <HeroSearch />

          <TryLinks />
        </section>

        <section
          aria-label="How it works"
          className="mx-auto w-full max-w-[960px] px-6 pb-16 max-sm:px-4"
        >
          <ol className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="flex flex-col gap-2 rounded-xl border p-5 shadow-card"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="text-[15px] font-semibold">{step.title}</h2>
                <p className="text-pretty text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
