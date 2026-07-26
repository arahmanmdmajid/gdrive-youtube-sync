declare namespace YT {
  interface PlayerEvent {
    target: Player;
  }

  interface OnStateChangeEvent extends PlayerEvent {
    data: number;
  }

  interface PlayerVars {
    enablejsapi?: 0 | 1;
    playsinline?: 0 | 1;
    origin?: string;
    [key: string]: unknown;
  }

  interface PlayerOptions {
    videoId?: string;
    host?: string;
    playerVars?: PlayerVars;
    events?: {
      onReady?: (event: PlayerEvent) => void;
      onStateChange?: (event: OnStateChangeEvent) => void;
    };
  }

  class Player {
    constructor(elementId: string | HTMLElement, options: PlayerOptions);
    getCurrentTime(): number;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    destroy(): void;
  }

  const PlayerState: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
    UNSTARTED: number;
  };
}

interface Window {
  YT?: typeof YT;
  onYouTubeIframeAPIReady?: () => void;
}
