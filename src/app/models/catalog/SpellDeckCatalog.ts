export interface SpellDeckEntry {
  spellId: string;
  quantity: number;
}

export interface SpellDeckConfig {
  id: string;
  label: string;
  cards: SpellDeckEntry[];
}
