import { Component } from "@angular/core";
import { TextButton } from "../../components/ui/text-button/text-button";
import { AuthService } from "../../services/_index";
  
@Component({
  selector: "app-landing-page",
  imports: [TextButton],
  templateUrl: "./landing-page.html",
  styleUrl: "./landing-page.scss",
})
export class LandingPage {
  constructor(private authService: AuthService) {}

  handleLogin() {
    this.authService.login();
  }
}
