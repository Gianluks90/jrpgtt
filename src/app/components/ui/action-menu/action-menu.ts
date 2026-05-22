import { Component, input } from "@angular/core";
import { CdkMenu, CdkMenuTrigger } from "@angular/cdk/menu";
import { TextButton } from "../text-button/text-button";
import { IconButton } from "../icon-button/icon-button";

@Component({
  selector: "action-menu",
  imports: [IconButton, CdkMenu, CdkMenuTrigger], 
  templateUrl: "./action-menu.html",
  styleUrl: "./action-menu.scss",
})
export class ActionMenu {
  public text = input("Menu");
  public iconUrl = input<string>("./icons/menu_20dp_E3E3E3_FILL1_wght400_GRAD0_opsz20.svg");
}