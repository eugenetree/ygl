"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WALL_CLIPS } from "../lib/data";
import { Icon, SearchBar, pushQueryPath } from "./shared";

export default function GentleHome() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [dark, setDark] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(pushQueryPath(q));
  }

  function goTo(phrase: string) {
    router.push(pushQueryPath(phrase));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setNowPlaying((n) => (n + 1) % WALL_CLIPS.length);
    }, 3600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={"gentle " + (dark ? "dark" : "")}>
      <div className="g-app">
        <header className="g-header">
          <div className="g-header-row">
            <div className="g-brand">
              saythis<span>.cc</span>
            </div>
            <div className="g-header-search">
              <SearchBar
                query={query}
                setQuery={setQuery}
                onSubmit={onSubmit}
                inputRef={searchRef}
              />
            </div>
            <div className="g-kbd-hint" aria-hidden="true">
              press <kbd>/</kbd> to search
            </div>
            <button className="g-theme" onClick={() => setDark(!dark)}>
              <Icon name={dark ? "sun" : "moon"} size={16} />
            </button>
          </div>
        </header>

        <section className="g-home-hero">
          <div className="g-home-hero-inner">
            <div className="g-home-eyebrow">
              <span className="g-home-pulse" />
              a listening dictionary
            </div>
            <h1 className="g-home-lede">
              Hear any phrase <em>actually said</em> by real people.
            </h1>
          </div>
        </section>

        <section className="g-wall" aria-label="A sample of clips in the library">
          <div className="g-wall-head">
            <div className="g-wall-label">
              <span className="g-wall-dot" />
              listening now
            </div>
            <div className="g-wall-hint">tap any phrase to hear it</div>
          </div>
          <div className="g-wall-grid">
            {WALL_CLIPS.map((c, i) => (
              <button
                key={c.id}
                className={"g-wall-card " + (i === nowPlaying ? "playing" : "")}
                onClick={() => goTo(c.phrase)}
              >
                <div className="g-wall-phrase">“{c.phrase}”</div>
                <div
                  className="g-wall-caption"
                  dangerouslySetInnerHTML={{ __html: c.caption }}
                />
                <div className="g-wall-meta">
                  <span className={"g-accent-pill g-accent-" + c.accent}>{c.accentShort}</span>
                  <span className="g-dot" />
                  <span className="g-wall-speaker">{c.speaker}</span>
                </div>
                <div className="g-wall-wave" aria-hidden="true">
                  {Array.from({ length: 14 }).map((_, j) => (
                    <span
                      key={j}
                      className="g-wall-wave-bar"
                      style={{ ["--d" as string]: j * 0.08 + "s" } as React.CSSProperties}
                    />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </section>

        <footer className="g-home-foot">
          <span>2.4M clips · 84k speakers · 112 regional accents</span>
        </footer>
      </div>
    </div>
  );
}
