import { SanctuaryElement } from "@models/world/MapCell";
import { FollowerParameterModifier } from "@models/player/FollowerCatalog";

export interface FollowerUpgradeDefinition {
  id: string;
  element: SanctuaryElement;
  nameSuffixKey: string;
  hpFloor: number;
  parameterModifiers: FollowerParameterModifier[];
}

export interface FollowerUpgradesConfig {
  upgrades: FollowerUpgradeDefinition[];
}
