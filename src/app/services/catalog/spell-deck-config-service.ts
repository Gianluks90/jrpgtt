import { Injectable } from "@angular/core";
import { SpellDeckConfig, SpellDeckEntry } from "@models/catalog/SpellDeckCatalog";

@Injectable({
  providedIn: "root",
})
export class SpellDeckConfigService {
  private readonly configUrl = "/configs/cards/spell-deck.config.json";
  private cache: SpellDeckConfig[] | null = null;
  private loadPromise: Promise<SpellDeckConfig[]> | null = null;

  public async loadDeckConfigs(): Promise<SpellDeckConfig[]> {
    if (this.cache) return this.cache;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      const response = await fetch(this.configUrl, { headers: { "content-type": "application/json" } });
      if (!response.ok) throw new Error("Unable to load spell deck configuration");
      const raw = await response.json() as unknown;
      const parsed = this.parseConfigs(raw);
      this.cache = parsed;
      return parsed;
    })();

    try {
      return await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  private parseConfigs(raw: unknown): SpellDeckConfig[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error("Invalid spell deck configuration: expected a non-empty array");
    }
    return raw.map((entry, i) => this.parseConfig(entry, i));
  }

  private parseConfig(raw: unknown, index: number): SpellDeckConfig {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid spell deck configuration at index ${index}`);
    }
    const typed = raw as { id?: unknown; label?: unknown; cards?: unknown };

    if (typeof typed.id !== "string" || typed.id.trim().length === 0) {
      throw new Error(`Invalid spell deck configuration at index ${index}: missing id`);
    }
    if (typeof typed.label !== "string") {
      throw new Error(`Invalid spell deck configuration '${typed.id}': missing label`);
    }
    if (!Array.isArray(typed.cards)) {
      throw new Error(`Invalid spell deck configuration '${typed.id}': missing cards array`);
    }

    return {
      id: typed.id,
      label: typed.label,
      cards: typed.cards.map((c, ci) => this.parseEntry(c, typed.id as string, ci)),
    };
  }

  private parseEntry(raw: unknown, configId: string, index: number): SpellDeckEntry {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid spell deck entry at index ${index} in config '${configId}'`);
    }
    const typed = raw as { spellId?: unknown; quantity?: unknown };

    if (typeof typed.spellId !== "string" || typed.spellId.trim().length === 0) {
      throw new Error(`Invalid spell deck entry at index ${index} in config '${configId}': missing spellId`);
    }
    if (typeof typed.quantity !== "number" || !Number.isFinite(typed.quantity) || typed.quantity < 1) {
      throw new Error(`Invalid spell deck entry '${typed.spellId}' in config '${configId}': invalid quantity`);
    }

    return {
      spellId: typed.spellId,
      quantity: Math.floor(typed.quantity),
    };
  }
}
