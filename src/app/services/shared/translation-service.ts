import { Injectable, signal } from "@angular/core";

export type LanguageCode = "en" | "it";

interface DictionaryObject {
  [key: string]: DictionaryNode;
}

type DictionaryNode = string | DictionaryObject;
type Dictionary = DictionaryObject;

@Injectable({ providedIn: "root" })
export class TranslationService {
  private readonly storageKey = "jrpgtt.language";
  private readonly fallbackLanguage: LanguageCode = "en";
  private readonly supportedLanguages: ReadonlyArray<LanguageCode> = ["en", "it"];

  private readonly languageSignal = signal<LanguageCode>(this.readStoredLanguage());
  private readonly activeDictionarySignal = signal<Dictionary>({});
  private readonly fallbackDictionarySignal = signal<Dictionary>({});

  public readonly language = this.languageSignal.asReadonly();

  constructor() {
    void this.bootstrap();
  }

  public async setLanguage(language: LanguageCode): Promise<void> {
    if (!this.supportedLanguages.includes(language)) {
      return;
    }

    this.languageSignal.set(language);
    this.persistLanguage(language);
    this.activeDictionarySignal.set(await this.loadDictionary(language));
  }

  public t(key: string, params?: Record<string, string | number>): string {
    const currentLanguage = this.languageSignal();
    const fallback = this.fallbackLanguage;
    const activeValue = this.resolveNested(this.activeDictionarySignal(), key);

    if (typeof activeValue === "string") {
      return this.interpolate(activeValue, params);
    }

    const fallbackValue = this.resolveNested(this.fallbackDictionarySignal(), key);
    if (typeof fallbackValue === "string") {
      return this.interpolate(fallbackValue, params);
    }

    if (currentLanguage !== fallback) {
      return `[${currentLanguage}] ${key}`;
    }

    return key;
  }

  public tOrFallback(key: string | null | undefined, fallbackText: string, params?: Record<string, string | number>): string {
    if (!key || typeof key !== "string" || !key.trim()) {
      return this.interpolate(fallbackText, params);
    }

    const activeValue = this.resolveNested(this.activeDictionarySignal(), key);
    if (typeof activeValue === "string" && activeValue.trim().length > 0) {
      return this.interpolate(activeValue, params);
    }

    const fallbackValue = this.resolveNested(this.fallbackDictionarySignal(), key);
    if (typeof fallbackValue === "string" && fallbackValue.trim().length > 0) {
      return this.interpolate(fallbackValue, params);
    }

    return this.interpolate(fallbackText, params);
  }

  public getSupportedLanguages(): ReadonlyArray<LanguageCode> {
    return this.supportedLanguages;
  }

  private async bootstrap(): Promise<void> {
    const language = this.languageSignal();
    const [fallbackDictionary, activeDictionary] = await Promise.all([
      this.loadDictionary(this.fallbackLanguage),
      this.loadDictionary(language),
    ]);

    this.fallbackDictionarySignal.set(fallbackDictionary);
    this.activeDictionarySignal.set(activeDictionary);
  }

  private readStoredLanguage(): LanguageCode {
    try {
      const storedLanguage = localStorage.getItem(this.storageKey);
      if (storedLanguage === "it" || storedLanguage === "en") {
        return storedLanguage;
      }
    } catch {
      // Ignore localStorage read errors and use fallback.
    }

    return this.fallbackLanguage;
  }

  private persistLanguage(language: LanguageCode): void {
    try {
      localStorage.setItem(this.storageKey, language);
    } catch {
      // Ignore localStorage write errors and keep runtime state only.
    }
  }

  private async loadDictionary(language: LanguageCode): Promise<Dictionary> {
    try {
      const response = await fetch(`/i18n/${language}.json`, {
        headers: { "Cache-Control": "no-cache" },
      });

      if (!response.ok) {
        return {};
      }

      const dictionary = (await response.json()) as unknown;
      if (dictionary && typeof dictionary === "object") {
        return dictionary as Dictionary;
      }
    } catch {
      // Ignore fetch and parse errors to keep app usable.
    }

    return {};
  }

  private resolveNested(dictionary: Dictionary, key: string): string | DictionaryNode | undefined {
    const path = key.split(".").filter(Boolean);
    let current: DictionaryNode | undefined = dictionary;

    for (const segment of path) {
      if (!current || typeof current === "string") {
        return undefined;
      }
      current = current[segment];
    }

    return current;
  }

  private interpolate(template: string, params?: Record<string, string | number>): string {
    if (!params) {
      return template;
    }

    return template.replace(/\{(\w+)\}/g, (_, key: string) => {
      const value = params[key];
      return typeof value === "undefined" ? `{${key}}` : String(value);
    });
  }
}