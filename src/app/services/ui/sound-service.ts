import { Injectable, signal } from "@angular/core";

export type SoundId = "luck-success" | "main" | "fight";

const SOUND_ASSETS_BY_ID: Record<SoundId, string[]> = {
  "luck-success": ["/sounds/final-fantasy-vii-sound-effects-save-and-load.mp3"],
  "main": [
    "/sounds/psychronic-main.mp3",
    "/sounds/psychronic-starfang-throne-377799.mp3",
  ],
  "fight": [
    "/sounds/psychronic-fight.mp3",
    "/sounds/psychronic-fight-or-fall-493954.mp3",
  ],
};

const SOUND_VOLUME_BY_ID: Record<SoundId, number> = {
  "luck-success": 1,
  "main": 0.5,
  "fight": 0.5,
};

const MAIN_FADE_OUT_DURATION_MS = 2200;

type BackgroundSoundMode = "play-main" | "fade-main" | "none";

@Injectable({
  providedIn: "root",
})
export class SoundService {
  private readonly storageKey = "jrpgtt:soundEnabled";
  private sounds = new Map<SoundId, HTMLAudioElement>();
  private soundAssetIndex = new Map<SoundId, number>();
  private initialized = false;
  private hasUserInteraction = false;
  private pendingSoundRetry = new Set<SoundId>();
  private removeInteractionListeners: (() => void) | null = null;
  private activeBackgroundMode: BackgroundSoundMode = "none";
  private fadeOutTimer: ReturnType<typeof setInterval> | null = null;
  public readonly isEnabled = signal(true);

  public initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.restoreEnabledState();
    this.registerInteractionUnlock();

    (Object.keys(SOUND_ASSETS_BY_ID) as SoundId[]).forEach((soundId) => {
      const initialAsset = SOUND_ASSETS_BY_ID[soundId][0];
      const audio = new Audio(initialAsset);
      audio.preload = "auto";
      audio.volume = SOUND_VOLUME_BY_ID[soundId];
      if (soundId === "main") {
        audio.loop = true;
      }

      this.soundAssetIndex.set(soundId, 0);
      audio.addEventListener("error", () => {
        this.switchToNextAsset(soundId, audio);
      });

      audio.load();
      this.sounds.set(soundId, audio);
    });
  }

  public play(soundId: SoundId): void {
    if (!this.isEnabled()) {
      return;
    }

    const audio = this.sounds.get(soundId);
    if (!audio) {
      return;
    }

    audio.volume = SOUND_VOLUME_BY_ID[soundId];
    audio.currentTime = 0;
    this.tryPlay(soundId, audio);
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled.set(enabled);

    try {
      localStorage.setItem(this.storageKey, enabled ? "1" : "0");
    } catch {
      // Ignore storage errors and keep runtime state only.
    }

    if (!enabled) {
      this.stopAll();
      return;
    }

    if (this.activeBackgroundMode === "play-main") {
      this.ensureMainLoopPlaying();
      return;
    }

    if (this.activeBackgroundMode === "fade-main") {
      this.fadeOutMainLoopAndStop(MAIN_FADE_OUT_DURATION_MS);
    }
  }

  public toggleEnabled(): void {
    this.setEnabled(!this.isEnabled());
  }

  private restoreEnabledState(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored === "0") {
        this.isEnabled.set(false);
        return;
      }
      if (stored === "1") {
        this.isEnabled.set(true);
      }
    } catch {
      // Ignore storage errors and use runtime default.
    }
  }

  private stopAll(): void {
    this.clearFadeOutTimer();
    this.sounds.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });

    (Object.keys(SOUND_VOLUME_BY_ID) as SoundId[]).forEach((soundId) => {
      const audio = this.sounds.get(soundId);
      if (!audio) {
        return;
      }
      audio.volume = SOUND_VOLUME_BY_ID[soundId];
    });
  }

  public syncBackgroundForUrl(url: string): void {
    const mode = this.resolveBackgroundMode(url);
    this.activeBackgroundMode = mode;

    if (!this.isEnabled()) {
      return;
    }

    if (mode === "play-main") {
      this.ensureMainLoopPlaying();
      return;
    }

    if (mode === "fade-main") {
      this.fadeOutMainLoopAndStop(MAIN_FADE_OUT_DURATION_MS);
      return;
    }

    this.stopMainLoopImmediately();
  }

  private resolveBackgroundMode(url: string): BackgroundSoundMode {
    const normalizedUrl = String(url ?? "").trim().toLowerCase();

    if (
      normalizedUrl === ""
      || normalizedUrl === "/"
      || normalizedUrl.startsWith("/home")
      || normalizedUrl.includes("/lobby")
    ) {
      return "play-main";
    }

    if (normalizedUrl.includes("/map")) {
      return "fade-main";
    }

    return "none";
  }

  private ensureMainLoopPlaying(): void {
    const mainAudio = this.sounds.get("main");
    if (!mainAudio) {
      return;
    }

    this.clearFadeOutTimer();
    mainAudio.volume = SOUND_VOLUME_BY_ID.main;
    if (!mainAudio.paused) {
      return;
    }

    const playPromise = mainAudio.play();
    this.tryPlay("main", mainAudio);
  }

  private fadeOutMainLoopAndStop(durationMs: number): void {
    const mainAudio = this.sounds.get("main");
    if (!mainAudio) {
      return;
    }

    this.clearFadeOutTimer();

    if (mainAudio.paused) {
      mainAudio.currentTime = 0;
      mainAudio.volume = SOUND_VOLUME_BY_ID.main;
      return;
    }

    const safeDurationMs = Math.max(200, Math.floor(durationMs));
    const stepMs = 100;
    const totalSteps = Math.max(1, Math.floor(safeDurationMs / stepMs));
    const startVolume = mainAudio.volume;
    let currentStep = 0;

    this.fadeOutTimer = setInterval(() => {
      currentStep += 1;
      const progress = Math.max(0, Math.min(1, currentStep / totalSteps));
      mainAudio.volume = Math.max(0, startVolume * (1 - progress));

      if (progress < 1) {
        return;
      }

      this.clearFadeOutTimer();
      mainAudio.pause();
      mainAudio.currentTime = 0;
      mainAudio.volume = SOUND_VOLUME_BY_ID.main;
    }, stepMs);
  }

  private stopMainLoopImmediately(): void {
    const mainAudio = this.sounds.get("main");
    if (!mainAudio) {
      return;
    }

    this.clearFadeOutTimer();
    mainAudio.pause();
    mainAudio.currentTime = 0;
    mainAudio.volume = SOUND_VOLUME_BY_ID.main;
  }

  private clearFadeOutTimer(): void {
    if (!this.fadeOutTimer) {
      return;
    }

    clearInterval(this.fadeOutTimer);
    this.fadeOutTimer = null;
  }

  private switchToNextAsset(soundId: SoundId, audio: HTMLAudioElement): void {
    const candidates = SOUND_ASSETS_BY_ID[soundId];
    const currentIndex = this.soundAssetIndex.get(soundId) ?? 0;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= candidates.length) {
      console.warn("Sound asset unavailable", {
        soundId,
        attemptedAssets: candidates,
      });
      return;
    }

    this.soundAssetIndex.set(soundId, nextIndex);
    audio.src = candidates[nextIndex];
    audio.load();

    if (soundId === "main" && this.isEnabled() && this.activeBackgroundMode === "play-main") {
      this.tryPlay("main", audio);
    }
  }

  private registerInteractionUnlock(): void {
    if (typeof window === "undefined" || this.removeInteractionListeners) {
      return;
    }

    const unlock = () => {
      this.hasUserInteraction = true;
      this.flushPendingSoundRetry();
      this.removeInteractionListeners?.();
      this.removeInteractionListeners = null;
    };

    const options: AddEventListenerOptions = { once: true, passive: true, capture: true };
    const eventNames: Array<keyof WindowEventMap> = ["pointerdown", "touchstart", "keydown", "click"];
    eventNames.forEach((eventName) => window.addEventListener(eventName, unlock, options));

    this.removeInteractionListeners = () => {
      eventNames.forEach((eventName) => window.removeEventListener(eventName, unlock, options));
    };
  }

  private tryPlay(soundId: SoundId, audio: HTMLAudioElement): void {
    const playPromise = audio.play();
    if (!playPromise || typeof playPromise.catch !== "function") {
      return;
    }

    playPromise.catch((error: unknown) => {
      const name = error instanceof DOMException ? error.name : "UnknownError";
      const message = error instanceof Error ? error.message : String(error);

      if (name === "NotAllowedError") {
        this.pendingSoundRetry.add(soundId);
        return;
      }

      console.warn("Sound playback failed", {
        soundId,
        asset: audio.currentSrc || audio.src,
        name,
        message,
      });
    });
  }

  private flushPendingSoundRetry(): void {
    if (!this.hasUserInteraction || !this.isEnabled() || this.pendingSoundRetry.size === 0) {
      return;
    }

    const pendingIds = Array.from(this.pendingSoundRetry);
    this.pendingSoundRetry.clear();

    pendingIds.forEach((soundId) => {
      if (soundId === "main") {
        if (this.activeBackgroundMode === "play-main") {
          this.ensureMainLoopPlaying();
        }
        return;
      }

      const audio = this.sounds.get(soundId);
      if (!audio) {
        return;
      }

      this.tryPlay(soundId, audio);
    });
  }
}
