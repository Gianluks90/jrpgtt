import { Injectable } from "@angular/core";

export interface SpellUpgradePair {
  from: string;
  to: string;
  cost: number;
}

@Injectable({
  providedIn: "root",
})
export class AcademySpellUpgradeConfigService {
  private readonly configUrl = "/configs/academy-spell-upgrade.config.json";
  private configCache: SpellUpgradePair[] | null = null;

  public async loadConfig(): Promise<SpellUpgradePair[]> {
    if (this.configCache) return this.configCache;

    const response = await fetch(this.configUrl, { headers: { "content-type": "application/json" } });
    if (!response.ok) {
      throw new Error("Unable to load academy spell upgrade configuration");
    }

    const raw = await response.json() as unknown;
    const parsed = this.parseConfig(raw);
    this.configCache = parsed;
    return parsed;
  }

  public getUpgradeForSpell(pairs: SpellUpgradePair[], fromSpellId: string): SpellUpgradePair | null {
    return pairs.find((p) => p.from === fromSpellId) ?? null;
  }

  private parseConfig(raw: unknown): SpellUpgradePair[] {
    if (!Array.isArray(raw)) {
      throw new Error("Invalid academy spell upgrade configuration: expected array");
    }

    return raw.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`Invalid academy spell upgrade configuration at index ${index}`);
      }

      const typed = entry as { from?: unknown; to?: unknown; cost?: unknown };

      if (typeof typed.from !== "string" || !typed.from.trim()) {
        throw new Error(`Invalid academy spell upgrade configuration at index ${index}: invalid 'from'`);
      }

      if (typeof typed.to !== "string" || !typed.to.trim()) {
        throw new Error(`Invalid academy spell upgrade configuration at index ${index}: invalid 'to'`);
      }

      const cost = Number(typed.cost);
      if (!Number.isFinite(cost) || cost < 0 || Math.floor(cost) !== cost) {
        throw new Error(`Invalid academy spell upgrade configuration at index ${index}: invalid 'cost'`);
      }

      return { from: typed.from.trim(), to: typed.to.trim(), cost: Math.floor(cost) };
    });
  }
}
