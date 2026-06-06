import { Injectable, signal } from "@angular/core";

export type SoundId = "luck-success";

const SOUND_ASSET_BY_ID: Record<SoundId, string> = {
  "luck-success": "/sounds/final-fantasy-vii-sound-effects-save-and-load.mp3",
};

@Injectable({
  providedIn: "root",
})
export class SoundService {
  private readonly storageKey = "jrpgtt:soundEnabled";
  private sounds = new Map<SoundId, HTMLAudioElement>();
  private initialized = false;
  public readonly isEnabled = signal(true);

  public initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.restoreEnabledState();

    (Object.keys(SOUND_ASSET_BY_ID) as SoundId[]).forEach((soundId) => {
      const audio = new Audio(SOUND_ASSET_BY_ID[soundId]);
      audio.preload = "auto";
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

    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Ignore autoplay and interruption errors; sound is cosmetic.
      });
    }
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
    this.sounds.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  }
}
