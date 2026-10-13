declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
  }
}

let api: Promise<typeof YT> | undefined;

/** The YouTube IFrame API, loading its script on the first call only. */
export function loadYouTubeIframeApi(): Promise<typeof YT> {
  api ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      api = undefined;
      script.remove();
      reject(new Error("The YouTube player couldn't load"));
    };
    document.head.append(script);
  });
  return api;
}
