let apiPromise: Promise<typeof YT> | null = null;

export function loadYouTubeIframeApi(): Promise<typeof YT> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });

  return apiPromise;
}

const RESUME_STORAGE_PREFIX = "lecture-resume-";
// Below this, resuming feels pointless — just start from the beginning.
const RESUME_MIN_SECONDS = 5;

export function getResumePosition(lectureId: number): number {
  const raw = localStorage.getItem(RESUME_STORAGE_PREFIX + lectureId);
  const seconds = raw ? Number(raw) : 0;
  return Number.isFinite(seconds) && seconds > RESUME_MIN_SECONDS ? seconds : 0;
}

export function saveResumePosition(lectureId: number, seconds: number): void {
  localStorage.setItem(RESUME_STORAGE_PREFIX + lectureId, String(Math.floor(seconds)));
}

export function clearResumePosition(lectureId: number): void {
  localStorage.removeItem(RESUME_STORAGE_PREFIX + lectureId);
}

export function withResumeParam(youtubeUrl: string, seconds: number): string {
  if (seconds <= RESUME_MIN_SECONDS) return youtubeUrl;
  const separator = youtubeUrl.includes("?") ? "&" : "?";
  return `${youtubeUrl}${separator}t=${Math.floor(seconds)}s`;
}
