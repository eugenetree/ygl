import { useEffect, useEffectEvent, useRef, useState } from "react";
import { loadYouTubeIframeApi } from "@/lib/youtube-iframe-api";

export type PlayerState =
  | "unstarted"
  | "ended"
  | "playing"
  | "paused"
  | "buffering"
  | "cued";

// YT.PlayerState is a declared enum, so reading it before the API script has
// loaded would throw.
const PLAYER_STATES: Record<number, PlayerState> = {
  [-1]: "unstarted",
  0: "ended",
  1: "playing",
  2: "paused",
  3: "buffering",
  5: "cued",
};

const TIME_POLL_MS = 250;

export type VideoPosition = { videoId: string; seconds: number };

export type PlayerControls = {
  /**
   * Plays a video from a point: seeks when it's the video already loaded,
   * loads it otherwise.
   */
  playAt(position: VideoPosition): void;
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  getState(): PlayerState;
};

/** One poll's view of the time moving, in seconds of video. */
export type TimeChange = {
  previous: number;
  current: number;
  /** Wall-clock time since the previous poll, in milliseconds. */
  elapsedMs: number;
};

/** The live player, and the video it has loaded. */
type Session = {
  player: YT.Player | null;
  videoId: string | null;
  /** The player's rate, as last asked for or reported. */
  rate: number;
  /**
   * The rate last asked for, until YouTube reports it. Reports for earlier
   * requests can arrive after a newer request and mustn't count as the
   * listener's choice.
   */
  requestedRate: number | null;
};

const NEW_SESSION: Session = {
  player: null,
  videoId: null,
  rate: 1,
  requestedRate: null,
};

/**
 * A YouTube player with its own controls, mounted into the element passed to
 * `ref`. It starts cued at `initialPosition` and plays every video at `rate`.
 * The controls are stable and do nothing until the player is ready. The
 * handlers see the latest render's values. The API has no time event, so the
 * time is polled.
 */
export function useYouTubePlayer({
  initialPosition,
  rate,
  onRateChange,
  onReady,
  onStateChange,
  onError,
  onAutoplayBlocked,
  onTimeChange,
}: {
  initialPosition: VideoPosition;
  rate: number;
  /** The listener picked another speed in YouTube's own menu. */
  onRateChange?: (rate: number) => void;
  onReady?: () => void;
  onStateChange?: (state: PlayerState) => void;
  /** YouTube's error code, e.g. 101 when the owner blocks embedding. */
  onError?: (code: number) => void;
  onAutoplayBlocked?: () => void;
  onTimeChange?: (change: TimeChange) => void;
}) {
  const [mount, setMount] = useState<HTMLDivElement | null>(null);
  const session = useRef<Session>({ ...NEW_SESSION });
  const [controls] = useState(() => controlsFor(session));
  const [isReady, setReady] = useState(false);
  const [state, setState] = useState<PlayerState>("unstarted");
  const [time, setTime] = useState(0);
  const [actualRate, setActualRate] = useState(1);

  const getInitialPosition = useEffectEvent(() => initialPosition);
  const handleReady = useEffectEvent((target: YT.Player) => {
    session.current.player = target;
    setReady(true);
    setTime(target.getCurrentTime());
    onReady?.();
  });
  const handleStateChange = useEffectEvent((code: number) => {
    const next = PLAYER_STATES[code] ?? "unstarted";
    // YouTube documents that loading a video resets its rate to 1, maybe
    // without reporting it.
    const { player } = session.current;
    if (next === "playing" && player && player.getPlaybackRate() !== rate) {
      requestRate(session.current, rate);
    }
    setState(next);
    onStateChange?.(next);
  });
  const handleError = useEffectEvent((code: number) => {
    // Seeking within a video that failed wouldn't report the error again.
    session.current.videoId = null;
    onError?.(code);
  });
  const handleRateChange = useEffectEvent((next: number) => {
    setActualRate(next);
    const current = session.current;
    if (current.requestedRate !== null) {
      if (next === current.requestedRate) current.requestedRate = null;
      return;
    }
    current.rate = next;
    if (next !== rate) onRateChange?.(next);
  });
  const handleAutoplayBlocked = useEffectEvent(() => onAutoplayBlocked?.());
  const handleTimeChange = useEffectEvent((change: TimeChange) => {
    setTime(change.current);
    onTimeChange?.(change);
  });

  useEffect(() => {
    if (!mount) return;
    let created: YT.Player | undefined;
    let isCancelled = false;

    loadYouTubeIframeApi().then(
      (api) => {
        if (isCancelled) return;
        // The API replaces this element with its iframe, so React mustn't
        // own it.
        const target = document.createElement("div");
        mount.append(target);
        const { videoId, seconds } = getInitialPosition();
        session.current.videoId = videoId;
        created = new api.Player(target, {
          width: "100%",
          height: "100%",
          videoId,
          playerVars: { start: Math.floor(seconds), rel: 0, playsinline: 1 },
          events: {
            onReady: (event) => handleReady(event.target),
            onStateChange: (event) => handleStateChange(event.data),
            onError: (event) => handleError(event.data),
            onAutoplayBlocked: () => handleAutoplayBlocked(),
            onPlaybackRateChange: (event) => handleRateChange(event.data),
          },
        });
      },
      (error: unknown) => console.error(error),
    );

    return () => {
      isCancelled = true;
      created?.destroy();
      mount.replaceChildren();
      session.current = { ...NEW_SESSION };
      setReady(false);
      setState("unstarted");
      setActualRate(1);
    };
  }, [mount]);

  useEffect(() => {
    if (isReady && session.current.rate !== rate) {
      requestRate(session.current, rate);
    }
  }, [isReady, rate]);

  useEffect(() => {
    const { player } = session.current;
    if (!isReady || !player) return;
    let previous = player.getCurrentTime();
    let polledAt = performance.now();
    const interval = window.setInterval(() => {
      const current = player.getCurrentTime();
      const now = performance.now();
      if (current !== previous) {
        handleTimeChange({ previous, current, elapsedMs: now - polledAt });
        previous = current;
      }
      polledAt = now;
    }, TIME_POLL_MS);
    return () => window.clearInterval(interval);
  }, [isReady]);

  return { ref: setMount, controls, isReady, state, time, rate: actualRate };
}

// YouTube may refuse a rate, but 0.25 to 2 are always offered, so every
// request gets reported back.
function requestRate(session: Session, rate: number) {
  if (!session.player) return;
  session.rate = rate;
  session.requestedRate = rate;
  session.player.setPlaybackRate(rate);
}

function controlsFor(session: { current: Session }): PlayerControls {
  return {
    playAt({ videoId, seconds }) {
      const { player } = session.current;
      if (!player) return;
      if (videoId === session.current.videoId) {
        player.seekTo(seconds, true);
        player.playVideo();
        return;
      }
      session.current.videoId = videoId;
      player.loadVideoById({ videoId, startSeconds: seconds });
    },
    play: () => session.current.player?.playVideo(),
    pause: () => session.current.player?.pauseVideo(),
    seekTo: (seconds) => session.current.player?.seekTo(seconds, true),
    getState: () => {
      const { player } = session.current;
      return (player && PLAYER_STATES[player.getPlayerState()]) || "unstarted";
    },
  };
}
