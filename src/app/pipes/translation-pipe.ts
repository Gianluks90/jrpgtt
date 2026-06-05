import { Pipe, PipeTransform, inject } from "@angular/core";
import { TranslationService } from "../services/translation-service";

@Pipe({
  name: "t",
  standalone: true,
  pure: false,
})
export class TranslationPipe implements PipeTransform {
  private readonly translationService = inject(TranslationService);

  public transform(key: string | null | undefined, params?: Record<string, string | number>): string {
    if (!key) {
      return "";
    }

    return this.translationService.t(key, params);
  }
}