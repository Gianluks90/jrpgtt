import { SanctuaryElement } from "@models/world/MapCell";

export type PlayerSpellSource = "sanctuary" | "merchant" | "enchantress" | "memory";

export interface PlayerSpellEntry {
  spellId: string;
  source?: PlayerSpellSource;
  blockedUntilTurn?: number;
  occupiesSlot?: boolean;
  grantedBySanctuaryElement?: SanctuaryElement;
}

export interface PlayerSpellbook {
  spells: PlayerSpellEntry[];
  capacity?: number;
}
