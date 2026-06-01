import { Injectable } from "@angular/core";

export type SoundId = "luck-success";

const SOUND_ASSET_BY_ID: Record<SoundId, string> = {
  "luck-success": "/sounds/final-fantasy-vii-sound-effects-save-and-load.mp3",
};

@Injectable({
  providedIn: "root",
})
export class SoundService {
  private sounds = new Map<SoundId, HTMLAudioElement>();
  private initialized = false;

  public initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    (Object.keys(SOUND_ASSET_BY_ID) as SoundId[]).forEach((soundId) => {
      const audio = new Audio(SOUND_ASSET_BY_ID[soundId]);
      audio.preload = "auto";
      audio.load();
      this.sounds.set(soundId, audio);
    });
  }

  public play(soundId: SoundId): void {
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
}
