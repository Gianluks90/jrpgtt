import { Injectable } from "@angular/core";
import { RulebookEntry } from "@models/ui/Rulebook";
import { LanguageCode } from "@services/shared/translation-service";

@Injectable({
  providedIn: "root",
})
export class RulebookCatalogService {
  private readonly configUrl = "/rulebook/rulebook-pages.json";
  private entriesCache: RulebookEntry[] | null = null;
  private entriesLoadPromise: Promise<RulebookEntry[]> | null = null;

  public async loadEntries(): Promise<RulebookEntry[]> {
    if (this.entriesCache) return this.entriesCache;
    if (this.entriesLoadPromise) return this.entriesLoadPromise;

    this.entriesLoadPromise = (async () => {
      const response = await fetch(this.configUrl, {
        headers: {
          "content-type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load rulebook index");
      }

      const raw = await response.json() as unknown;
      const parsed = this.parseEntries(raw);
      this.entriesCache = parsed;
      return parsed;
    })();

    try {
      return await this.entriesLoadPromise;
    } finally {
      this.entriesLoadPromise = null;
    }
  }

  public async loadPageMarkdown(pageId: number, language: LanguageCode): Promise<string> {
    const normalizedPageId = Math.floor(Number(pageId));
    if (!Number.isFinite(normalizedPageId) || normalizedPageId <= 0) {
      throw new Error("Invalid rulebook page id");
    }

    const preferredUrl = this.buildPageUrl(normalizedPageId, language);
    const fallbackLanguage: LanguageCode = language === "it" ? "en" : "it";
    const fallbackUrl = this.buildPageUrl(normalizedPageId, fallbackLanguage);

    const preferredResponse = await fetch(preferredUrl, {
      headers: {
        "content-type": "text/markdown",
      },
    });

    if (preferredResponse.ok) {
      return preferredResponse.text();
    }

    const fallbackResponse = await fetch(fallbackUrl, {
      headers: {
        "content-type": "text/markdown",
      },
    });

    if (fallbackResponse.ok) {
      return fallbackResponse.text();
    }

    throw new Error(`Unable to load rulebook page for id '${normalizedPageId}'`);
  }

  private parseEntries(raw: unknown): RulebookEntry[] {
    if (!Array.isArray(raw)) {
      throw new Error("Invalid rulebook index: root must be an array");
    }

    const seenPageIds = new Set<number>();
    const parsed = raw.map((entry, index) => this.parseEntry(entry, index));
    parsed.forEach((entry) => {
      if (seenPageIds.has(entry.pageId)) {
        throw new Error(`Invalid rulebook index: duplicate pageId '${entry.pageId}'`);
      }
      seenPageIds.add(entry.pageId);
    });

    return parsed;
  }

  private parseEntry(raw: unknown, index: number): RulebookEntry {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid rulebook index: entry at index ${index} is invalid`);
    }

    const typed = raw as {
      pageId?: unknown;
      labelKey?: unknown;
    };

    const pageId = Math.floor(Number(typed.pageId));
    if (!Number.isFinite(pageId) || pageId <= 0) {
      throw new Error(`Invalid rulebook index: entry at index ${index} has invalid pageId`);
    }

    if (typeof typed.labelKey !== "string" || !typed.labelKey.trim()) {
      throw new Error(`Invalid rulebook index: entry '${pageId}' has invalid labelKey`);
    }

    return {
      pageId,
      labelKey: typed.labelKey.trim(),
    };
  }

  private buildPageUrl(pageId: number, language: LanguageCode): string {
    return `/rulebook/pages/${language}/${pageId}.md`;
  }
}
