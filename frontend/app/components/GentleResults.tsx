"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { SearchResponse, VideoCaption } from "@api/contract";
import { EXAMPLE_PHRASES } from "../lib/data";
import { getVideoCaptions, searchClips } from "../lib/api";
import Account from "./Account";
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

interface Result {
  id: string;
  videoId: string;
  startAt: number; // seconds
  text: string;
}

const PAGE_SIZE = 20;

function toResult(clip: SearchResponse["clips"][number]): Result {
  return {
    id: clip.captionId,
    videoId: clip.videoId,
    startAt: clip.playFrom / 1000,
    text: clip.text,
  };
}

function fmtTotal(total: number, isTotalExact: boolean) {
  return `${total.toLocaleString("en-US")}${isTotalExact ? "" : "+"}`;
}

// Close to Elasticsearch's standard tokenizer, which the captions index searches with.
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

function Highlighted({ text, query }: { text: string; query: string }) {
  const words = new Set(Array.from(query.matchAll(WORD), (m) => m[0].toLowerCase()));
  const parts: React.ReactNode[] = [];
  let run: { start: number; end: number } | null = null;
  let last = 0;

  function flush() {
    if (!run) return;
    parts.push(text.slice(last, run.start), <mark key={run.start}>{text.slice(run.start, run.end)}</mark>);
    last = run.end;
    run = null;
  }

  for (const m of text.matchAll(WORD)) {
    const start = m.index;
    const end = start + m[0].length;
    if (!words.has(m[0].toLowerCase())) {
      flush();
    } else if (run && /^\s+$/.test(text.slice(run.end, start))) {
      run.end = end;
    } else {
      flush();
      run = { start, end };
    }
  }
  flush();
  parts.push(text.slice(last));
  return <>{parts}</>;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function GentleResults({ query }: { query: string }) {
  const router = useRouter();
  const [queryInput, setQueryInput] = useState(query);
  const [accent, setAccent] = useState<AccentFilter>("all");
  const [speed, setSpeed] = useState<SpeedFilter>("any");
  const [dark, setDark] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [total, setTotal] = useState(0);
  const [isTotalExact, setIsTotalExact] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const [activeId, setActiveId] = useState<string>("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [captions, setCaptions] = useState<{ videoId: string; lines: VideoCaption[] }>();

  const playerRef = useRef<any>(null);
  const playerDivRef = useRef<HTMLDivElement>(null);
  const playerReadyRef = useRef(false);
  const activeRef = useRef<Result | undefined>(undefined);
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    setLoading(true);
    setLoadingMore(false);
    setEndReached(false);
    setResults([]);
    setTotal(0);
    setIsTotalExact(true);
    setActiveId("");

    searchClips({ q: query, limit: PAGE_SIZE })
      .then((page) => {
        if (queryRef.current !== query) return;
        const mapped = page.clips.map(toResult);
        setResults(mapped);
        setTotal(page.total);
        setIsTotalExact(page.isTotalExact);
        setActiveId(mapped[0]?.id ?? "");
      })
      .catch(() => {
        if (queryRef.current === query) setResults([]);
      })
      .finally(() => {
        if (queryRef.current === query) setLoading(false);
      });
  }, [query]);

  const active = results.find((r) => r.id === activeId) ?? results[0];
  activeRef.current = active;
  const activeVideoId = active?.videoId;

  useEffect(() => {
    if (!activeVideoId) return;
    let stale = false;
    getVideoCaptions(activeVideoId)
      .then(({ captions }) => {
        if (!stale) setCaptions({ videoId: activeVideoId, lines: captions });
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [activeVideoId]);

  // Until playback reaches a line of this video's captions, the matched line stands in.
  const nowMs = currentTime * 1000;
  const spoken =
    captions && captions.videoId === activeVideoId
      ? captions.lines.findLast((line) => line.startTime <= nowMs)?.text
      : undefined;

  const idx = active ? results.findIndex((r) => r.id === activeId) : -1;
  // The API never counts past what it can page to, so total also caps the offset.
  const hasMore = !endReached && results.length < total;

  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;
    if (idx !== results.length - 1) return;

    const requestedFor = query;
    setLoadingMore(true);
    searchClips({
      q: query,
      offset: results.length,
      limit: Math.min(PAGE_SIZE, total - results.length),
    })
      .then((page) => {
        if (queryRef.current !== requestedFor) return;
        const seen = new Set(results.map((r) => r.id));
        const fresh = page.clips.map(toResult).filter((r) => !seen.has(r.id));
        if (fresh.length === 0) {
          setEndReached(true);
          return;
        }
        setResults([...results, ...fresh]);
        setTotal(page.total);
        setIsTotalExact(page.isTotalExact);
      })
      .catch(() => {
        if (queryRef.current === requestedFor) setEndReached(true);
      })
      .finally(() => {
        if (queryRef.current === requestedFor) setLoadingMore(false);
      });
  }, [idx, results, hasMore, loading, loadingMore, query, total]);

  const isEmpty = results.length === 0;
  const emptyReason: EmptyReason = !loading && isEmpty ? "no-phrase" : null;

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

  useEffect(() => {
    if (!active) return;

    function createPlayer() {
      if (!playerDivRef.current || playerRef.current) return;
      const current = activeRef.current;
      if (!current) return;
      playerRef.current = new window.YT.Player(playerDivRef.current, {
        videoId: current.videoId,
        width: "100%",
        height: "100%",
        playerVars: { start: Math.floor(current.startAt), autoplay: 1, rel: 0 },
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
  }, [!!active]);

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

  const atStart = idx <= 0;
  const atEnd = idx >= results.length - 1;

  return (
    <div className={"gentle " + (dark ? "dark" : "")}>
      <div className="g-app">
        <header className="g-header">
          <div className="g-header-row">
            <button className="g-brand g-brand-btn" onClick={goHome}>
              saythis<span>.co</span>
            </button>
            <div className="g-header-search">
              <SearchBar query={queryInput} setQuery={setQueryInput} onSubmit={onSubmit} />
            </div>
            <div className="g-header-right">
              <button className="g-theme" onClick={() => setDark(!dark)}>
                <Icon name={dark ? "sun" : "moon"} size={16} />
              </button>
              <Account />
            </div>
          </div>
          <div className="g-header-row thin">
            <FilterChips
              accent={accent}
              setAccent={setAccent}
              speed={speed}
              setSpeed={setSpeed}
            />
            <div className="g-count">
              {loading ? (
                <span>searching…</span>
              ) : isEmpty ? (
                <span>no clips</span>
              ) : (
                <span>
                  <b>{fmtTotal(total, isTotalExact)}</b> clips
                </span>
              )}
            </div>
          </div>
        </header>

        <main className="g-main">
          {loading ? null : isEmpty || !active ? (
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
                <div className="g-player-caption">
                  <Highlighted text={spoken ?? active.text} query={query} />
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
                    Clip <b>{idx + 1}</b> of <b>{fmtTotal(total, isTotalExact)}</b>
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
            Nobody&apos;s saying <em>"{query}"</em> yet
          </>
        )}
      </h2>
      <p className="g-empty-sub">
        {filtered ? (
          <>
            Loosen the accent or speed and we&apos;ll likely find clips for{" "}
            <em>"{query}"</em>.
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
        <button className="g-empty-btn" onClick={() => tryPhrase("once in a while")}>
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
