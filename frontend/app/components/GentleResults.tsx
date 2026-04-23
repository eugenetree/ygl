"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { EXAMPLE_PHRASES, MOCK_RESULTS } from "../lib/data";
import {
  Icon,
  SearchBar,
  pushQueryPath,
  type AccentFilter,
  type EmptyReason,
  type SpeedFilter,
} from "./shared";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const MOCKED_QUERY = "test";

export default function GentleResults({ query }: { query: string }) {
  const router = useRouter();
  const [queryInput, setQueryInput] = useState(query);
  const [accent, setAccent] = useState<AccentFilter>("all");
  const [speed, setSpeed] = useState<SpeedFilter>("any");
  const [dark, setDark] = useState(false);
  const [activeId, setActiveId] = useState<string>(MOCK_RESULTS[0].id);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const playerRef = useRef<any>(null);
  const playerDivRef = useRef<HTMLDivElement>(null);
  const playerReadyRef = useRef(false);
  const activeRef = useRef<(typeof MOCK_RESULTS)[0] | undefined>(undefined);

  const isMockedQuery = query.trim().toLowerCase() === MOCKED_QUERY;

  const allResults = isMockedQuery ? MOCK_RESULTS : [];
  const results = allResults.filter((r) => {
    if (accent !== "all" && r.accent !== accent) return false;
    if (speed !== "any" && r.speed !== speed) return false;
    return true;
  });
  const active = results.find((r) => r.id === activeId) || results[0];

  const totalMatches = results.reduce((s, r) => s + r.matches, 0);
  const filtersActive = accent !== "all" || speed !== "any";
  const emptyReason: EmptyReason =
    results.length > 0
      ? null
      : !isMockedQuery
        ? "no-phrase"
        : filtersActive
          ? "filtered-out"
          : "no-phrase";

  const isEmpty = results.length === 0;

  function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = queryInput.trim();
    if (!q) return;
    router.push(pushQueryPath(q));
  }

  function resetFilters() {
    setAccent("all");
    setSpeed("any");
  }

  function goHome() {
    router.push("/");
  }

  function tryPhrase(p: string) {
    router.push(pushQueryPath(p));
  }

  activeRef.current = active;

  useEffect(() => {
    function createPlayer() {
      if (!playerDivRef.current || playerRef.current) return;
      const { videoId, startAt } = activeRef.current!;
      playerRef.current = new window.YT.Player(playerDivRef.current, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: { start: startAt, autoplay: 1, rel: 0 },
        events: {
          onReady: () => {
            playerReadyRef.current = true;
            setPlaying(true);
          },
          onStateChange: (e: any) => {
            setPlaying(e.data === window.YT.PlayerState.PLAYING);
          },
        },
      });
    }

    if (window.YT?.Player) {
      createPlayer();
    } else {
      window.onYouTubeIframeAPIReady = createPlayer;
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    }

    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
      playerReadyRef.current = false;
    };
  }, []);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    if (!active || !playerRef.current || !playerReadyRef.current) return;
    playerRef.current.loadVideoById({ videoId: active.videoId, startSeconds: active.startAt });
  }, [activeId]);

  useEffect(() => {
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      setCurrentTime(p.getCurrentTime());
      setDuration(p.getDuration());
    }, 250);
    return () => clearInterval(id);
  }, []);

  function togglePlay() {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo();
    else p.playVideo();
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const idx = active ? results.findIndex((r) => r.id === activeId) : -1;
  const atStart = idx <= 0;
  const atEnd = idx >= results.length - 1;

  return (
    <div className={"gentle " + (dark ? "dark" : "")}>
      <div className="g-app">
        <header className="g-header">
          <div className="g-header-row">
            <button className="g-brand g-brand-btn" onClick={goHome}>
              saythis<span>.cc</span>
            </button>
            <div className="g-header-search">
              <SearchBar query={queryInput} setQuery={setQueryInput} onSubmit={onSubmit} />
            </div>
            <button className="g-theme" onClick={() => setDark(!dark)}>
              <Icon name={dark ? "sun" : "moon"} size={16} />
            </button>
          </div>
          <div className="g-header-row thin">
            <FilterChips
              accent={accent}
              setAccent={setAccent}
              speed={speed}
              setSpeed={setSpeed}
            />
            <div className="g-count">
              {isEmpty ? (
                <span>no clips</span>
              ) : (
                <span>
                  <b>{totalMatches}</b> matches in <b>{results.length}</b> clips
                </span>
              )}
            </div>
          </div>
        </header>

        <main className="g-main">
          {isEmpty || !active ? (
            <EmptyState
              query={query}
              reason={emptyReason}
              resetFilters={resetFilters}
              tryPhrase={tryPhrase}
            />
          ) : (
            <section className="g-player">
              <div className="g-player-video">
                <div ref={playerDivRef} />
              </div>
              <div className="g-player-meta">
                <div
                  className="g-player-caption"
                  dangerouslySetInnerHTML={{ __html: active.caption }}
                />
                <div className="g-player-sub">
                  <span className={"g-accent-pill g-accent-" + active.accent}>
                    {active.accentLabel}
                  </span>
                  <span className="g-dot" />
                  <span>{active.speaker}</span>
                  <span className="g-dot" />
                  <span className="g-muted">{active.title}</span>
                </div>
                <div className="g-player-controls">
                  <button
                    className="g-circ"
                    disabled={atStart}
                    onClick={() => {
                      if (!atStart) setActiveId(results[idx - 1].id);
                    }}
                  >
                    <Icon name="prev" size={18} />
                  </button>
                  <button className="g-circ big" onClick={togglePlay}>
                    <Icon name={playing ? "pause" : "play"} size={22} />
                  </button>
                  <button
                    className="g-circ"
                    disabled={atEnd}
                    onClick={() => {
                      if (!atEnd) setActiveId(results[idx + 1].id);
                    }}
                  >
                    <Icon name="next" size={18} />
                  </button>
                  <div className="g-clip-pos">
                    Clip <b>{idx + 1}</b> of <b>{results.length}</b>
                  </div>
                  <div className="g-scrub">
                    <div className="g-scrub-bar">
                      <div className="g-scrub-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="g-scrub-time">{fmt(currentTime)} / {fmt(duration)}</div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function FilterChips({
  accent,
  setAccent,
  speed,
  setSpeed,
}: {
  accent: AccentFilter;
  setAccent: (v: AccentFilter) => void;
  speed: SpeedFilter;
  setSpeed: (v: SpeedFilter) => void;
}) {
  const accents: { id: AccentFilter; label: string }[] = [
    { id: "all", label: "All accents" },
    { id: "us", label: "US" },
    { id: "uk", label: "UK" },
    { id: "au", label: "AU" },
    { id: "ca", label: "CA" },
  ];
  const speeds: { id: SpeedFilter; label: string }[] = [
    { id: "any", label: "Any speed" },
    { id: "slow", label: "Slow" },
    { id: "normal", label: "Normal" },
    { id: "fast", label: "Fast" },
  ];
  return (
    <div className="g-chips">
      <div className="g-chipgroup">
        {accents.map((a) => (
          <button
            key={a.id}
            className={"g-chip " + (accent === a.id ? "active" : "")}
            onClick={() => setAccent(a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>
      <span className="g-chip-sep" />
      <div className="g-chipgroup">
        {speeds.map((s) => (
          <button
            key={s.id}
            className={"g-chip " + (speed === s.id ? "active" : "")}
            onClick={() => setSpeed(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyState({
  query,
  reason,
  resetFilters,
  tryPhrase,
}: {
  query: string;
  reason: EmptyReason;
  resetFilters: () => void;
  tryPhrase: (p: string) => void;
}) {
  const filtered = reason === "filtered-out";
  return (
    <section className="g-empty">
      <div className="g-empty-art" aria-hidden="true">
        <span className="g-empty-ring r1" />
        <span className="g-empty-ring r2" />
        <span className="g-empty-ring r3" />
        <span className="g-empty-ring r4" />
        <span className="g-empty-core" />
      </div>
      <h2 className="g-empty-title">
        {filtered ? (
          <>No clips match your filters</>
        ) : (
          <>
            Nobody&apos;s saying <em>“{query}”</em> yet
          </>
        )}
      </h2>
      <p className="g-empty-sub">
        {filtered ? (
          <>
            Loosen the accent or speed and we&apos;ll likely find clips for{" "}
            <em>“{query}”</em>.
          </>
        ) : (
          <>
            We couldn&apos;t find this phrase in the corpus. Try a small variation, or
            one of the phrases below.
          </>
        )}
      </p>

      <div className="g-empty-actions">
        {filtered && (
          <button className="g-empty-btn primary" onClick={resetFilters}>
            <Icon name="filter" size={14} />
            Clear filters
          </button>
        )}
        <button className="g-empty-btn" onClick={() => tryPhrase(MOCKED_QUERY)}>
          <Icon name="sparkle" size={14} />
          Surprise me
        </button>
      </div>

      <div className="g-empty-examples">
        <div className="g-empty-eyebrow">Try one of these</div>
        <div className="g-empty-chips">
          {EXAMPLE_PHRASES.map((p) => (
            <button key={p} className="g-empty-chip" onClick={() => tryPhrase(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
