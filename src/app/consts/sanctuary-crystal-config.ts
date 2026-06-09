export interface SanctuaryCrystalConfig {
  renderer: {
    antialias: boolean;
    pixelated: boolean;
    renderScale: number;
    pixelRatioCap: number;
  };
  geometry: {
    bodyRadius: number;
    bodyHeight: number;
    tipHeight: number;
    radialSegments: number;
    scale: {
      x: number;
      y: number;
      z: number;
    };
  };
  visuals: {
    inactiveOpacity: number;
    activeOpacity: number;
    edgeLineWidth: number;
    edgeOpacity: number;
    glowSize: number;
    glowOpacityInactive: number;
    glowOpacityActive: number;
  };
  animation: {
    inactiveRotationSpeed: number;
    activeRotationSpeed: number;
    bobAmplitude: number;
    bobSpeed: number;
    smoothing: number;
  };
}

export type SanctuaryCrystalPreset = "classic" | "pixel";

export const SANCTUARY_CRYSTAL_PRESETS: Record<SanctuaryCrystalPreset, SanctuaryCrystalConfig> = {
  classic: {
    renderer: {
      antialias: true,
      pixelated: false,
      renderScale: 1,
      pixelRatioCap: 2,
    },
    geometry: {
      bodyRadius: 0.44,
      bodyHeight: 0.82,
      tipHeight: 0.28,
      radialSegments: 6,
      scale: {
        x: 0.9,
        y: 1.28,
        z: 1,
      },
    },
    visuals: {
      inactiveOpacity: 1,
      activeOpacity: 1,
      edgeLineWidth: 2.4,
      edgeOpacity: 1,
      glowSize: 1.9,
      glowOpacityInactive: 0.12,
      glowOpacityActive: 0.6,
    },
    animation: {
      inactiveRotationSpeed: 0.2,
      activeRotationSpeed: 0.5,
      bobAmplitude: 0.035,
      bobSpeed: 1.15,
      smoothing: 3,
    },
  },
  pixel: {
    renderer: {
      antialias: false,
      pixelated: true,
      renderScale: 0.6,
      pixelRatioCap: 1,
    },
    geometry: {
      bodyRadius: 0.44,
      bodyHeight: 0.82,
      tipHeight: 0.28,
      radialSegments: 6,
      scale: {
        x: 0.9,
        y: 1.28,
        z: 1,
      },
    },
    visuals: {
      inactiveOpacity: 1,
      activeOpacity: 1,
      edgeLineWidth: 2,
      edgeOpacity: 1,
      glowSize: 1.7,
      glowOpacityInactive: 0.1,
      glowOpacityActive: 0.36,
    },
    animation: {
      inactiveRotationSpeed: 0.2,
      activeRotationSpeed: 0.5,
      bobAmplitude: 0.03,
      bobSpeed: 1.05,
      smoothing: 2.3,
    },
  },
};

export const SANCTUARY_CRYSTAL_PRESET: SanctuaryCrystalPreset = "pixel";

export const SANCTUARY_CRYSTAL_CONFIG: SanctuaryCrystalConfig = SANCTUARY_CRYSTAL_PRESETS[SANCTUARY_CRYSTAL_PRESET];

/* Legacy single config shape retained via SANCTUARY_CRYSTAL_CONFIG for component consumers. */
export const SANCTUARY_CRYSTAL_DEFAULT_CONFIG = SANCTUARY_CRYSTAL_CONFIG;
