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
type Session = { player: YT.Player | null; videoId: string | null };

/**
 * A YouTube player with its own controls, mounted into the element passed to
 * `ref`. It starts cued at `initialPosition`. The controls are stable and do
 * nothing until the player is ready. The handlers see the latest render's
 * values. The API has no time event, so the time is polled.
 */
export function useYouTubePlayer({
  initialPosition,
  onReady,
  onStateChange,
  onError,
  onAutoplayBlocked,
  onTimeChange,
}: {
  initialPosition: VideoPosition;
  onReady?: () => void;
  onStateChange?: (state: PlayerState) => void;
  /** YouTube's error code, e.g. 101 when the owner blocks embedding. */
  onError?: (code: number) => void;
  onAutoplayBlocked?: () => void;
  onTimeChange?: (change: TimeChange) => void;
}) {
  const [mount, setMount] = useState<HTMLDivElement | null>(null);
  const session = useRef<Session>({ player: null, videoId: null });
  const [controls] = useState(() => controlsFor(session));
  const [isReady, setReady] = useState(false);
  const [state, setState] = useState<PlayerState>("unstarted");
  const [time, setTime] = useState(0);
  const [rate, setRate] = useState(1);

  const getInitialPosition = useEffectEvent(() => initialPosition);
  const handleReady = useEffectEvent((target: YT.Player) => {
    session.current.player = target;
    setReady(true);
    setTime(target.getCurrentTime());
    onReady?.();
  });
  const handleStateChange = useEffectEvent((code: number) => {
    const next = PLAYER_STATES[code] ?? "unstarted";
    setState(next);
    onStateChange?.(next);
  });
  const handleError = useEffectEvent((code: number) => {
    // Seeking within a video that failed wouldn't report the error again.
    session.current.videoId = null;
    onError?.(code);
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
            onPlaybackRateChange: (event) => setRate(event.data),
          },
        });
      },
      (error: unknown) => console.error(error),
    );

    return () => {
      isCancelled = true;
      created?.destroy();
      mount.replaceChildren();
      session.current = { player: null, videoId: null };
      setReady(false);
      setState("unstarted");
    };
  }, [mount]);

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

  return { ref: setMount, controls, isReady, state, time, rate };
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
