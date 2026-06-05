import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { TextButton } from "../../components/ui/text-button/text-button";
import { AuthService } from "../../services/_index";
import { getAuth, onAuthStateChanged, Unsubscribe } from "firebase/auth";
import { Router } from "@angular/router";
import { TranslationPipe } from "../../pipes/translation-pipe";
import { LanguageCode, TranslationService } from "../../services/translation-service";
  
@Component({
  selector: "app-landing-page",
  imports: [TextButton, TranslationPipe],
  templateUrl: "./landing-page.html",
  styleUrl: "./landing-page.scss",
})
export class LandingPage implements OnInit, OnDestroy {
  private authUnsubscribe: Unsubscribe | null = null;
  private readonly translationService = inject(TranslationService);
  protected readonly language = this.translationService.language;

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  public ngOnInit(): void {
    const auth = getAuth();
    this.authUnsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      void this.router.navigate(["/home"]);
    });
  }

  public ngOnDestroy(): void {
    this.authUnsubscribe?.();
    this.authUnsubscribe = null;
  }

  public handleLogin(): void {
    void this.authService.login();
  }

  public async setLanguage(language: LanguageCode): Promise<void> {
    await this.translationService.setLanguage(language);
  }
}
