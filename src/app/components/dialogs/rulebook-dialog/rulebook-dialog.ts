import { DialogRef } from "@angular/cdk/dialog";
import { Component, effect, Injector, inject, OnInit, signal } from "@angular/core";
import { marked } from "marked";
import { DialogResponse } from "@models/ui/DialogResponse";
import { RulebookEntry } from "@models/ui/Rulebook";
import { RulebookCatalogService } from "@services/catalog/rulebook-catalog-service";
import { TranslationService } from "@services/shared/translation-service";
import { TranslationPipe } from "../../../pipes/translation-pipe";
import { DialogWrapper } from "../../ui/dialog-wrapper/dialog-wrapper";
import { TextButton } from "../../ui/text-button/text-button";

@Component({
  selector: "app-rulebook-dialog",
  imports: [DialogWrapper, TextButton, TranslationPipe],
  templateUrl: "./rulebook-dialog.html",
  styleUrl: "./rulebook-dialog.scss",
})
export class RulebookDialog implements OnInit {
  private injector = inject(Injector);
  public entries = signal<RulebookEntry[]>([]);
  public selectedEntryIndex = signal<number>(0);
  public renderedHtml = signal<string>("");
  public isLoadingIndex = signal<boolean>(true);
  public isLoadingPage = signal<boolean>(false);
  public loadingError = signal<string | null>(null);

  constructor(
    private dialogRef: DialogRef<DialogResponse<never>>,
    private rulebookCatalogService: RulebookCatalogService,
    private translationService: TranslationService,
  ) {}

  public async ngOnInit(): Promise<void> {
    effect(() => {
      const currentLanguage = this.translationService.language();
      const entries = this.entries();
      const selectedIndex = this.selectedEntryIndex();
      const entry = entries[selectedIndex] ?? null;
      if (!entry) return;

      void this.loadPage(entry, currentLanguage);
    }, { injector: this.injector });

    await this.loadEntries();
  }

  public selectEntry(index: number): void {
    const entries = this.entries();
    if (index < 0 || index >= entries.length) return;

    this.selectedEntryIndex.set(index);
  }

  public close(): void {
    this.dialogRef.close({
      result: "cancel",
    });
  }

  private async loadEntries(): Promise<void> {
    this.isLoadingIndex.set(true);
    this.loadingError.set(null);

    try {
      const entries = await this.rulebookCatalogService.loadEntries();
      this.entries.set(entries);

      if (entries.length === 0) {
        this.renderedHtml.set("");
        return;
      }

      this.selectedEntryIndex.set(0);
    } catch (error) {
      console.error(error);
      this.loadingError.set(this.translationService.tOrFallback(
        "dialogs.rulebook.loadIndexError",
        "Unable to load rulebook index.",
      ));
    } finally {
      this.isLoadingIndex.set(false);
    }
  }

  private async loadPage(entry: RulebookEntry, language: "it" | "en"): Promise<void> {
    this.isLoadingPage.set(true);
    this.loadingError.set(null);

    try {
      const markdown = await this.rulebookCatalogService.loadPageMarkdown(entry.pageId, language);
      const parsed = marked.parse(markdown);
      const html = typeof parsed === "string" ? parsed : await parsed;
      this.renderedHtml.set(html);
    } catch (error) {
      console.error(error);
      this.renderedHtml.set("");
      this.loadingError.set(this.translationService.tOrFallback(
        "dialogs.rulebook.loadPageError",
        "Unable to load the selected rulebook page.",
      ));
    } finally {
      this.isLoadingPage.set(false);
    }
  }
}
