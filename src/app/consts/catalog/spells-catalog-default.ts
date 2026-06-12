import { SpellsCatalogConfig } from "@models/catalog/SpellCatalog";

export const DEFAULT_SPELLS_CATALOG_CONFIG: SpellsCatalogConfig = {
  spellbook: {
    defaultCapacity: 4,
  },
  spells: [
    {
      id: "wind-shift",
      mpCost: 2,
      cooldownTurns: 1,
      occupiesSlot: true,
      timing: "my-turn",
      ui: {
        name: "Wind Shift",
        descriptionTemplate: "Teleport to an explored tile within {range} orthogonal cells. Counts as your movement for this turn.",
        i18n: {
          nameKey: "spells.windShift.name",
          descriptionKey: "spells.windShift.description",
        },
      },
      effect: {
        type: "teleport-explored-orthogonal",
        baseRange: 1,
        rangePerMagic: 1,
      },
      acquisition: [
        {
          source: "sanctuary",
          sanctuaryElement: "wind",
        },
      ],
    },
    {
      id: "earth-mend",
      mpCost: 2,
      cooldownTurns: 0,
      occupiesSlot: true,
      timing: "my-turn",
      ui: {
        name: "Earth Mend",
        descriptionTemplate: "Restore {healing} HP to yourself. Power scales with Magic.",
        i18n: {
          nameKey: "spells.earthMend.name",
          descriptionKey: "spells.earthMend.description",
        },
      },
      effect: {
        type: "heal-self",
        baseAmount: 2,
        amountPerMagic: 2,
      },
      acquisition: [
        {
          source: "sanctuary",
          sanctuaryElement: "earth",
        },
        {
          source: "merchant",
          merchantIds: ["academy-merchant"],
        },
      ],
    },
    {
      id: "fire-rigene",
      mpCost: 3,
      cooldownTurns: 2,
      occupiesSlot: true,
      timing: "my-turn",
      ui: {
        name: "Rigene",
        descriptionTemplate: "Apply Regeneration to yourself for {duration} turns. Duration scales with Magic.",
        i18n: {
          nameKey: "spells.fireRigene.name",
          descriptionKey: "spells.fireRigene.description",
        },
      },
      effect: {
        type: "apply-status-self",
        statusKey: "regen",
        baseDurationTurns: 1,
        durationPerMagic: 1,
      },
      acquisition: [
        {
          source: "sanctuary",
          sanctuaryElement: "fire",
        },
        {
          source: "enchantress",
          enchantressRewardIds: ["pending-magic-reward"],
        },
      ],
    },
    {
      id: "water-flood",
      mpCost: 6,
      cooldownTurns: 0,
      consumableOnCast: true,
      occupiesSlot: false,
      timing: "my-turn",
      ui: {
        name: "Flood",
        descriptionTemplate: "Transform your current non-special tile into Water permanently. The page disintegrates after cast.",
        i18n: {
          nameKey: "spells.waterFlood.name",
          descriptionKey: "spells.waterFlood.description",
        },
      },
      effect: {
        type: "transform-current-cell-biome",
        biome: "water",
      },
      acquisition: [
        {
          source: "sanctuary",
          sanctuaryElement: "water",
        },
      ],
    },
  ],
};
