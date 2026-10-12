"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  nextSpeed,
  usePlaybackSpeed,
} from "@/components/player/playback-speed";
import {
  type PlayerState,
  useYouTubePlayer,
  type VideoPosition,
} from "@/components/player/use-youtube-player";
import {
  type SearchClips,
  useSearchClips,
} from "@/components/search/use-search-clips";
import type { ClipBatch, HighlightedClip } from "@/lib/clip-batch";
import { playedPastClipEnd } from "@/lib/clip-loop";

type Direction = 1 | -1;

export type PlaybackState = SearchClips & {
  /** More clips exist than are loaded. */
  hasMoreClips: boolean;
  isLoadingMoreClips: boolean;
  currentIndex: number;
  currentClip: HighlightedClip;
  hasPrevious: boolean;
  hasNext: boolean;
  isPlaying: boolean;
  isLooping: boolean;
  /** Our Play didn't start the video; some touch browsers want a tap on it first. */
  needsTap: boolean;
  /** The playback rate, kept across clips and visits. */
  speed: number;
};

export type PlaybackActions = {
  /** Makes a clip current and plays it from its play-from point. */
  playClip: (index: number) => void;
  previous: () => void;
  /** Past the last loaded clip, loads the next batch and plays into it. */
  next: () => void;
  /** Loads the next batch without changing the clip. */
  showMoreClips: () => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  /** Plays the current clip again from its play-from point. */
  replay: () => void;
  setLooping: (isLooping: boolean) => void;
  setSpeed: (speed: number) => void;
  /** Moves to the next of our speeds, from 1× to slower. */
  cycleSpeed: () => void;
};

export type PlaybackMeta = {
  /** Where the YouTube player mounts. Remounting it reloads the video. */
  playerRef: (element: HTMLDivElement | null) => void;
};

const PlaybackContext = createContext<{
  state: PlaybackState;
  actions: PlaybackActions;
  meta: PlaybackMeta;
} | null>(null);

// Apart from the rest, so its four updates a second re-render only its readers.
const PlaybackTimeContext = createContext(0);

// Removed or private, embedding disallowed by the owner, or a bad video id.
const UNPLAYABLE_ERRORS = new Set([2, 100, 101, 150]);

const TAP_HINT_DELAY_MS = 1000;

function positionOf(clip: HighlightedClip): VideoPosition {
  return { videoId: clip.video.id, seconds: clip.playFrom / 1000 };
}

function isPlayingState(state: PlayerState): boolean {
  return state === "playing" || state === "buffering";
}

/**
 * A search's clips and the one playing. Every clip load tries to play with
 * sound; when the browser blocks that, the clip waits at its play-from point.
 */
export function PlaybackProvider({
  query,
  queryWords,
  firstBatch,
  children,
}: {
  query: string;
  queryWords: readonly string[];
  firstBatch: ClipBatch;
  children: React.ReactNode;
}) {
  const { search, hasNextPage, isFetchingNextPage, loadMore } = useSearchClips({
    query,
    queryWords,
    firstBatch,
  });
  const { clips } = search;
  const [currentIndex, setCurrentIndex] = useState(0);
  // The clip Next was pressed on while the batch after it loads.
  const [waitingFrom, setWaitingFrom] = useState<number | null>(null);
  const [isLooping, setLooping] = useState(true);
  const [needsTap, setNeedsTap] = useState(false);
  const [speed, setSpeed] = usePlaybackSpeed();
  const direction = useRef<Direction>(1);
  const isAutoplayBlocked = useRef(false);
  const lastTimeMs = useRef(0);
  const tapHintTimer = useRef<number | undefined>(undefined);

  const currentClip = clips[currentIndex];

  const player = useYouTubePlayer({
    initialPosition: positionOf(currentClip),
    rate: speed,
    onRateChange: setSpeed,
    onReady: () => startClip(currentIndex, direction.current),
    onStateChange: (state) => {
      if (isPlayingState(state)) {
        isAutoplayBlocked.current = false;
        hideTapHint();
      }
      // The time check can't see a caption that runs to the video's end.
      const { playFrom, endTime } = currentClip;
      const wasInClip =
        lastTimeMs.current >= playFrom && lastTimeMs.current <= endTime;
      if (state === "ended" && isLooping && wasInClip) {
        startClip(currentIndex, direction.current);
      }
    },
    onError: (code) => {
      if (!UNPLAYABLE_ERRORS.has(code)) return;
      const target = currentIndex + direction.current;
      const canLoadTarget = direction.current === 1 && hasNextPage;
      if (!clips[target] && !canLoadTarget) return;
      toast("Skipped a video that can't be played here", {
        id: "unplayable-video",
      });
      if (clips[target]) {
        startClip(target, direction.current);
      } else {
        continuePastLoaded(currentIndex);
      }
    },
    onAutoplayBlocked: () => {
      isAutoplayBlocked.current = true;
    },
    onTimeChange: ({ previous, current, elapsedMs }) => {
      lastTimeMs.current = current * 1000;
      const ranOn = playedPastClipEnd(
        currentClip,
        previous * 1000,
        current * 1000,
        elapsedMs * player.rate,
      );
      if (isLooping && ranOn) {
        lastTimeMs.current = currentClip.playFrom;
        controls.seekTo(currentClip.playFrom / 1000);
      }
    },
  });
  const { controls } = player;

  const hideTapHint = useCallback(() => {
    window.clearTimeout(tapHintTimer.current);
    setNeedsTap(false);
  }, []);
  useEffect(() => () => window.clearTimeout(tapHintTimer.current), []);

  const startClip = useCallback(
    (index: number, towards: Direction) => {
      const clip = clips[index];
      if (!clip) return;
      direction.current = towards;
      isAutoplayBlocked.current = false;
      lastTimeMs.current = clip.playFrom;
      hideTapHint();
      setWaitingFrom(null);
      setCurrentIndex(index);
      controls.playAt(positionOf(clip));
    },
    [clips, controls, hideTapHint],
  );

  const continuePastLoaded = useCallback(
    (from: number) => {
      setWaitingFrom(from);
      loadMore().then((loaded) => {
        // Nothing new to move to: a failure, or a batch of clips already seen.
        if (!loaded?.clips[from + 1]) {
          setWaitingFrom((waiting) => (waiting === from ? null : waiting));
        }
      });
    },
    [loadMore],
  );

  // In an effect, not after loadMore resolves: the new clips must have
  // rendered before the index can point at one.
  useEffect(() => {
    if (waitingFrom !== null && clips[waitingFrom + 1]) {
      startClip(waitingFrom + 1, 1);
    }
  }, [waitingFrom, clips, startClip]);

  const isOnLastLoadedClip = currentIndex === clips.length - 1;
  useEffect(() => {
    if (isOnLastLoadedClip && hasNextPage) loadMore();
  }, [isOnLastLoadedClip, hasNextPage, loadMore]);

  const isPlaying = isPlayingState(player.state);
  const hasPrevious = currentIndex > 0;
  const hasNext = !isOnLastLoadedClip || hasNextPage;

  const playClip = useCallback(
    (index: number) => startClip(index, index < currentIndex ? -1 : 1),
    [startClip, currentIndex],
  );
  const previous = useCallback(() => {
    if (hasPrevious) startClip(currentIndex - 1, -1);
  }, [hasPrevious, startClip, currentIndex]);
  const next = useCallback(() => {
    if (!isOnLastLoadedClip) {
      startClip(currentIndex + 1, 1);
    } else if (hasNextPage) {
      continuePastLoaded(currentIndex);
    }
  }, [
    isOnLastLoadedClip,
    hasNextPage,
    startClip,
    continuePastLoaded,
    currentIndex,
  ]);
  const showMoreClips = useCallback(() => {
    loadMore();
  }, [loadMore]);

  const play = useCallback(() => {
    if (isAutoplayBlocked.current) {
      controls.playAt(positionOf(currentClip));
    } else {
      controls.play();
    }
    if (window.matchMedia("(pointer: coarse)").matches) {
      window.clearTimeout(tapHintTimer.current);
      tapHintTimer.current = window.setTimeout(() => {
        if (!isPlayingState(controls.getState())) setNeedsTap(true);
      }, TAP_HINT_DELAY_MS);
    }
  }, [controls, currentClip]);
  const pause = useCallback(() => controls.pause(), [controls]);
  const togglePlay = useCallback(
    () => (isPlaying ? pause() : play()),
    [isPlaying, pause, play],
  );
  const replay = useCallback(
    () => startClip(currentIndex, direction.current),
    [startClip, currentIndex],
  );
  const cycleSpeed = useCallback(
    () => setSpeed(nextSpeed(speed)),
    [setSpeed, speed],
  );

  // Kept stable between time polls.
  const value = useMemo(
    () => ({
      state: {
        ...search,
        hasMoreClips: hasNextPage,
        isLoadingMoreClips: isFetchingNextPage,
        currentIndex,
        currentClip,
        hasPrevious,
        hasNext,
        isPlaying,
        isLooping,
        needsTap,
        speed,
      },
      actions: {
        playClip,
        previous,
        next,
        showMoreClips,
        play,
        pause,
        togglePlay,
        replay,
        setLooping,
        setSpeed,
        cycleSpeed,
      },
      meta: { playerRef: player.ref },
    }),
    [
      search,
      hasNextPage,
      isFetchingNextPage,
      currentIndex,
      currentClip,
      hasPrevious,
      hasNext,
      isPlaying,
      isLooping,
      needsTap,
      speed,
      playClip,
      previous,
      next,
      showMoreClips,
      play,
      pause,
      togglePlay,
      replay,
      setSpeed,
      cycleSpeed,
      player.ref,
    ],
  );

  const timeMs = player.isReady
    ? Math.round(player.time * 1000)
    : currentClip.playFrom;

  return (
    <PlaybackContext value={value}>
      <PlaybackTimeContext value={timeMs}>{children}</PlaybackTimeContext>
    </PlaybackContext>
  );
}

export function usePlayback() {
  const playback = use(PlaybackContext);
  if (!playback) throw new Error("usePlayback needs a PlaybackProvider");
  return playback;
}

/** The time in the video, in milliseconds. */
export function usePlaybackTime(): number {
  return use(PlaybackTimeContext);
}
