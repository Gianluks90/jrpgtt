import { ActionsCatalogConfig } from "../models/ActionCatalog";

export const DEFAULT_ACTIONS_CATALOG_CONFIG: ActionsCatalogConfig = {
  actions: [
    {
      id: "end-turn",
      ui: {
        label: "End turn",
        descriptionTemplate: "Pass your turn. {reason}",
        i18n: {
          labelKey: "actions.endTurn.label",
          descriptionKey: "actions.endTurn.description",
        },
      },
      flow: {
        handler: "end-turn",
        errorMessage: "Error while ending turn",
        trigger: "command-panel",
        validators: ["my-turn"],
        dialog: {
          type: "none",
        },
        requiresMyTurn: true,
        requiresCanEndTurn: true,
      },
    },
    {
      id: "activate-sanctuary",
      ui: {
        label: "Activate",
        descriptionTemplate: "Infuse your magic into {sanctuaryLabel} to activate it and attune to its element.",
        i18n: {
          labelKey: "actions.activateSanctuary.label",
          descriptionKey: "actions.activateSanctuary.description",
        },
      },
      flow: {
        handler: "sanctuary-activate",
        errorMessage: "Error while activating sanctuary",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "sanctuary-action",
          sanctuaryMode: "activate",
          requiredActive: false,
        },
        requiresMyTurn: true,
      },
    },
    {
      id: "sanctuary",
      ui: {
        label: "Sanctuary",
        descriptionTemplate: "Open the sanctuary and choose one of its available actions.",
        i18n: {
          labelKey: "actions.sanctuary.label",
          descriptionKey: "actions.sanctuary.description",
        },
      },
      flow: {
        handler: "sanctuary-open",
        errorMessage: "Error while opening sanctuary actions",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy"],
        dialog: {
          type: "sanctuary-action",
          sanctuaryMode: "actions",
          requiredActive: true,
        },
        requiresMyTurn: true,
      },
    },
    {
      id: "donate-sanctuary",
      ui: {
        label: "Donate",
        descriptionTemplate: "Offer 5 coins to {sanctuaryLabel} and shift your attunement.",
        i18n: {
          labelKey: "actions.donateSanctuary.label",
          descriptionKey: "actions.donateSanctuary.description",
        },
      },
      flow: {
        handler: "sanctuary-donate",
        errorMessage: "Error while donating at sanctuary",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "sanctuary-action",
          sanctuaryMode: "donate",
          requiredActive: true,
        },
        requiresMyTurn: true,
      },
    },
    {
      id: "pray-sanctuary",
      ui: {
        label: "Pray",
        descriptionTemplate: "Pray. If you are heard, recover 5% HP, or 10% on a lucky omen, then end your turn.",
        i18n: {
          labelKey: "actions.praySanctuary.label",
          descriptionKey: "actions.praySanctuary.description",
        },
      },
      flow: {
        handler: "sanctuary-pray",
        errorMessage: "Error while praying at sanctuary",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "none",
        },
        requiresMyTurn: true,
      },
    },
    {
      id: "cell-gather",
      ui: {
        label: "Gather",
        descriptionTemplate: "Spend 1 food to forage this biome, gain 1 resource, then end your turn.",
        i18n: {
          labelKey: "actions.cellGather.label",
          descriptionKey: "actions.cellGather.description",
        },
      },
      flow: {
        handler: "biome-cell-gather",
        errorMessage: "Error while gathering resources",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "none",
        },
        requiresMyTurn: true,
      },
    },
    {
      id: "chop-tree",
      ui: {
        label: "Chop wood",
        descriptionTemplate: "Use your axe in a forest to gain 1 timber, then end your turn.",
        i18n: {
          labelKey: "actions.chopTree.label",
          descriptionKey: "actions.chopTree.description",
        },
      },
      flow: {
        handler: "biome-chop-tree",
        errorMessage: "Error while chopping a tree",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "none",
        },
        requiresMyTurn: true,
      },
    },
    {
      id: "consume-ration",
      ui: {
        label: "Consume ration",
        descriptionTemplate: "Spend 1 food to gain Nutrition until end of turn and ignore hostile desert harm.",
        i18n: {
          labelKey: "actions.consumeRation.label",
          descriptionKey: "actions.consumeRation.description",
        },
      },
      flow: {
        handler: "biome-consume-ration",
        errorMessage: "Error while consuming ration",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "none",
        },
        requiresMyTurn: true,
      },
    },
    {
      id: "feed-horse",
      ui: {
        label: "Feed horse",
        descriptionTemplate: "Spend 1 food before moving to gain +1 movement range this turn.",
        i18n: {
          labelKey: "actions.feedHorse.label",
          descriptionKey: "actions.feedHorse.description",
        },
      },
      flow: {
        handler: "follower-feed-horse",
        errorMessage: "Error while feeding horse",
        trigger: "command-panel",
        validators: ["my-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "none",
        },
        requiresMyTurn: true,
      },
    },
    {
      id: "safe-place-wait",
      ui: {
        label: "Wait",
        descriptionTemplate: "Hold position at this safe place, then end your turn at no cost.",
        i18n: {
          labelKey: "actions.safePlaceWait.label",
          descriptionKey: "actions.safePlaceWait.description",
        },
      },
      flow: {
        handler: "safe-place-wait",
        errorMessage: "Error while waiting at safe place",
        trigger: "command-panel",
        validators: ["my-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "none",
        },
        requiresMyTurn: true,
      },
      log: {
        sourceLabel: "Safe place wait",
      },
    },
    {
      id: "fast-travel",
      ui: {
        label: "Fast travel",
        descriptionTemplate: "Travel to a discovered safe place. Pay 1 coin per orthogonal cell (max 15), then end your turn and skip your next one.",
        i18n: {
          labelKey: "actions.fastTravel.label",
          descriptionKey: "actions.fastTravel.description",
        },
      },
      flow: {
        handler: "safe-place-fast-travel",
        errorMessage: "Error while using fast travel",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "safe-place-fast-travel",
        },
        requiresMyTurn: true,
      },
      log: {
        sourceLabel: "Fast travel",
      },
    },
    {
      id: "capital-doctor",
      ui: {
        label: "Doctor",
        descriptionTemplate: "Visit the Capital Doctor: each treatment restores 5% HP and costs {costPerUnit} coins ({timeOfDay}). Then end your turn.",
        i18n: {
          labelKey: "actions.capitalDoctor.label",
          descriptionKey: "actions.capitalDoctor.description",
        },
      },
      flow: {
        handler: "safe-place-doctor",
        errorMessage: "Error while using capital doctor",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "doctor-heal",
        },
        requiresMyTurn: true,
      },
      log: {
        sourceLabel: "Capital Doctor",
      },
    },
    {
      id: "capital-enchantress",
      ui: {
        label: "Enchantress",
        descriptionTemplate: "Consult the Capital Enchantress for 5 coins. Draw your fate from a luck check, then end your turn.",
        i18n: {
          labelKey: "actions.capitalEnchantress.label",
          descriptionKey: "actions.capitalEnchantress.description",
        },
      },
      flow: {
        handler: "safe-place-enchantress",
        errorMessage: "Error while consulting the enchantress",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "none",
        },
        requiresMyTurn: true,
      },
      log: {
        sourceLabel: "Capital Enchantress",
      },
    },
    {
      id: "city-healer",
      ui: {
        label: "Healer",
        descriptionTemplate: "Visit the City Healer: each treatment restores 5% HP and costs {costPerUnit} coins ({timeOfDay}). Then end your turn.",
        i18n: {
          labelKey: "actions.cityHealer.label",
          descriptionKey: "actions.cityHealer.description",
        },
      },
      flow: {
        handler: "safe-place-doctor",
        errorMessage: "Error while using city healer",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "doctor-heal",
        },
        requiresMyTurn: true,
      },
      log: {
        sourceLabel: "City Healer",
      },
    },
    {
      id: "city-mystic",
      ui: {
        label: "Mystic",
        descriptionTemplate: "Consult the City Mystic for 5 coins. Draw your fate from a luck check, then end your turn.",
        i18n: {
          labelKey: "actions.cityMystic.label",
          descriptionKey: "actions.cityMystic.description",
        },
      },
      flow: {
        handler: "safe-place-mystic",
        errorMessage: "Error while consulting the mystic",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "none",
        },
        requiresMyTurn: true,
      },
      log: {
        sourceLabel: "City Mystic",
      },
    },
    {
      id: "city-merchant",
      ui: {
        label: "Merchant",
        descriptionTemplate: "Visit the City Merchant. Buy or sell items from a configurable stock. Buying ends your turn.",
        i18n: {
          labelKey: "actions.cityMerchant.label",
          descriptionKey: "actions.cityMerchant.description",
        },
      },
      flow: {
        handler: "safe-place-merchant",
        errorMessage: "Error while trading with the city merchant",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy"],
        dialog: {
          type: "merchant-trade",
          stockConfigUrl: "/configs/merchant-stock/city-merchant.stock.json",
        },
        requiresMyTurn: true,
      },
      log: {
        sourceLabel: "City Merchant",
      },
    },
    {
      id: "capital-inn",
      ui: {
        label: "Inn",
        descriptionTemplate: "Rest at the Capital Inn: restore 50% HP, pay 10 coins, then end your turn (day only).",
        i18n: {
          labelKey: "actions.capitalInn.label",
          descriptionKey: "actions.capitalInn.description",
        },
      },
      flow: {
        handler: "safe-place-inn",
        errorMessage: "Error while resting at capital inn",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "none",
        },
        requiresMyTurn: true,
      },
      log: {
        sourceLabel: "Capital Inn",
      },
    },
    {
      id: "village-craftsman",
      ui: {
        label: "Craftsman",
        descriptionTemplate: "Trade resources 1:1 at the Village Craftsman, then end your turn.",
        i18n: {
          labelKey: "actions.villageCraftsman.label",
          descriptionKey: "actions.villageCraftsman.description",
        },
      },
      flow: {
        handler: "safe-place-resource-exchange",
        errorMessage: "Error while exchanging resources at village craftsman",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "resource-exchange",
        },
        requiresMyTurn: true,
      },
      log: {
        sourceLabel: "Village Craftsman",
      },
    },
    {
      id: "camp-gatherer",
      ui: {
        label: "Gatherer",
        descriptionTemplate: "Call the Camp Gatherer: gain 1 timber and 1 minerals, then end your turn.",
        warningTemplate: "Warning: camp reward needs {requiredSlots} free slots, available {availableSlots}.",
        i18n: {
          labelKey: "actions.campGatherer.label",
          descriptionKey: "actions.campGatherer.description",
          warningKey: "actions.campGatherer.warning.capacity",
        },
      },
      flow: {
        handler: "safe-place-camp-gatherer",
        errorMessage: "Error while using camp gatherer",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy"],
        dialog: {
          type: "none",
        },
        requiresMyTurn: true,
      },
      log: {
        sourceLabel: "Camp Gatherer",
      },
    },
    {
      id: "camp-hunter",
      ui: {
        label: "Hunter",
        descriptionTemplate: "Call the Camp Hunter: gain 1 food and 1 cloth, then end your turn.",
        warningTemplate: "Warning: camp reward needs {requiredSlots} free slots, available {availableSlots}.",
        i18n: {
          labelKey: "actions.campHunter.label",
          descriptionKey: "actions.campHunter.description",
          warningKey: "actions.campHunter.warning.capacity",
        },
      },
      flow: {
        handler: "safe-place-camp-hunter",
        errorMessage: "Error while using camp hunter",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy"],
        dialog: {
          type: "none",
        },
        requiresMyTurn: true,
      },
      log: {
        sourceLabel: "Camp Hunter",
      },
    },
    {
      id: "graveyard-resurrect",
      ui: {
        label: "Resurrect",
        descriptionTemplate: "Attempt to resurrect a dead follower from your discard pile through a luck check. Outcomes may be dangerous.",
        i18n: {
          labelKey: "actions.graveyardResurrect.label",
          descriptionKey: "actions.graveyardResurrect.description",
        },
      },
      flow: {
        handler: "graveyard-resurrect",
        errorMessage: "Error while attempting graveyard resurrection",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "none",
        },
        requiresMyTurn: true,
      },
      log: {
        sourceLabel: "Graveyard",
      },
    },
    {
      id: "temple-send-devotee",
      ui: {
        label: "Send devotee",
        descriptionTemplate: "Leave an eligible follower at the Temple. Your alignment becomes good, gain 2 XP, then end turn.",
        i18n: {
          labelKey: "actions.templeSendDevotee.label",
          descriptionKey: "actions.templeSendDevotee.description",
        },
      },
      flow: {
        handler: "temple-send-devotee",
        errorMessage: "Error while sending devotee at temple",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "none",
        },
        requiresMyTurn: true,
      },
      log: {
        sourceLabel: "Temple",
      },
    },
    {
      id: "altar-sacrifice",
      ui: {
        label: "Sacrifice",
        descriptionTemplate: "Sacrifice an eligible follower at the Altar. Your alignment becomes evil, gain 2 XP, then end turn.",
        i18n: {
          labelKey: "actions.altarSacrifice.label",
          descriptionKey: "actions.altarSacrifice.description",
        },
      },
      flow: {
        handler: "altar-sacrifice",
        errorMessage: "Error while performing altar sacrifice",
        trigger: "command-panel",
        validators: ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "none",
        },
        requiresMyTurn: true,
      },
      log: {
        sourceLabel: "Altar",
      },
    },
    {
      id: "eliminate-zombie",
      ui: {
        label: "Eliminate zombie",
        descriptionTemplate: "Destroy your zombie companion and end your turn.",
        i18n: {
          labelKey: "actions.eliminateZombie.label",
          descriptionKey: "actions.eliminateZombie.description",
        },
      },
      flow: {
        handler: "follower-eliminate-zombie",
        errorMessage: "Error while eliminating zombie",
        trigger: "command-panel",
        validators: ["my-turn", "not-busy", "action-not-used"],
        dialog: {
          type: "none",
        },
        requiresMyTurn: true,
      },
      log: {
        sourceLabel: "Zombie",
      },
    },
  ],
};