import { SpellsCatalogConfig } from "@models/catalog/SpellCatalog";

export const DEFAULT_SPELLS_CATALOG_CONFIG: SpellsCatalogConfig = {
  spellbook: {
    defaultCapacity: 4,
  },
  spells: [
    {
      id: "B-SP-001",
      mpCost: 3,
      cooldownTurns: 1,
      occupiesSlot: true,
      timing: "my-turn",
      ui: {
        name: "Fly",
        descriptionTemplate: "Enable diagonal movement for this turn. Must be cast before moving.",
        i18n: {
          nameKey: "catalogs.spells.B-SP-001.name",
          descriptionKey: "catalogs.spells.B-SP-001.description",
        },
      },
      effect: {
        type: "enable-diagonal-movement",
      },
      acquisition: [
        {
          source: "sanctuary",
          sanctuaryElement: "wind",
        },
      ],
    },
    {
      id: "B-SP-002",
      mpCost: 3,
      cooldownTurns: 1,
      occupiesSlot: true,
      timing: "my-turn",
      ui: {
        name: "Healing Waters",
        descriptionTemplate: "Apply Nutrition to yourself for 1 turn.",
        i18n: {
          nameKey: "catalogs.spells.B-SP-002.name",
          descriptionKey: "catalogs.spells.B-SP-002.description",
        },
      },
      effect: {
        type: "apply-status-self",
        statusKey: "nutrition",
        baseDurationTurns: 1,
        durationPerMagic: 0,
      },
      acquisition: [
        {
          source: "sanctuary",
          sanctuaryElement: "water",
        },
      ],
    },
    {
      id: "B-SP-003",
      mpCost: 3,
      cooldownTurns: 1,
      occupiesSlot: true,
      timing: "my-turn",
      ui: {
        name: "Inner Fire",
        descriptionTemplate: "Apply Bravery to yourself for 1 turn. Increases Strength by 1.",
        i18n: {
          nameKey: "catalogs.spells.B-SP-003.name",
          descriptionKey: "catalogs.spells.B-SP-003.description",
        },
      },
      effect: {
        type: "apply-status-self",
        statusKey: "bravery",
        baseDurationTurns: 1,
        durationPerMagic: 0,
      },
      acquisition: [
        {
          source: "sanctuary",
          sanctuaryElement: "fire",
        },
      ],
    },
    {
      id: "B-SP-004",
      mpCost: 3,
      cooldownTurns: 1,
      occupiesSlot: true,
      timing: "my-turn",
      ui: {
        name: "Reinvigorate",
        descriptionTemplate: "Restore HP equal to your current Magic value.",
        i18n: {
          nameKey: "catalogs.spells.B-SP-004.name",
          descriptionKey: "catalogs.spells.B-SP-004.description",
        },
      },
      effect: {
        type: "heal-self",
        baseAmount: 0,
        amountPerMagic: 1,
      },
      acquisition: [
        {
          source: "sanctuary",
          sanctuaryElement: "earth",
        },
      ],
    },
  ],
};
