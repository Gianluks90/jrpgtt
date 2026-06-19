import { Injectable } from "@angular/core";
import { PlacedEnemyCard, ExplorationElement } from "@models/exploration/ExplorationCard";
import { CombatResult, CombatOutcome, CombatRollSnapshot } from "@models/exploration/CombatState";
import { SanctuaryElement } from "@models/world/MapCell";
import { TimeOfDay } from "@models/world/WorldState";

export interface ResolveFightInput {
  playerCombatStat: number;
  playerLuck: number;
  playerElement?: SanctuaryElement;
  quadrantElement?: SanctuaryElement;
  enemy: PlacedEnemyCard;
  timeOfDay: TimeOfDay;
  playerEquipmentBonus?: number;
}

export interface ResolveFleeInput {
  playerLuck: number;
  enemy: PlacedEnemyCard;
}

// fire > earth > wind > water > fire
const ELEMENT_CHAIN: ExplorationElement[] = ["fire", "earth", "wind", "water"];

const AUTO_WIN_THRESHOLD = 10;

@Injectable({
  providedIn: "root",
})
export class CombatResolverService {

  public resolveFight(input: ResolveFightInput): CombatResult {
    const enemyCombatStatValue = input.enemy.combatStat === "strength"
      ? input.enemy.strength
      : input.enemy.magic;

    const playerLuckRoll = this.rollCombatLuck(input.playerLuck);
    const enemyLuckRoll = this.rollCombatLuck(input.enemy.luck);

    const elementMods = this.computeElementModifiers(
      input.playerElement,
      input.enemy.element,
      input.quadrantElement,
    );
    const timeModifier = this.computeTimeModifier(input.enemy.time, input.timeOfDay);

    const equipmentBonus = Math.max(0, Math.floor(Number(input.playerEquipmentBonus ?? 0)));

    // On critical (roll = 100), the combat stat is also added to the luck bonus
    const playerEffectiveBonus = playerLuckRoll.critical
      ? playerLuckRoll.bonus + input.playerCombatStat + equipmentBonus
      : playerLuckRoll.bonus;
    const enemyEffectiveBonus = enemyLuckRoll.critical
      ? enemyLuckRoll.bonus + enemyCombatStatValue
      : enemyLuckRoll.bonus;

    const playerTotal = input.playerCombatStat + equipmentBonus + playerEffectiveBonus + elementMods.playerMod;
    const enemyTotal = enemyCombatStatValue + enemyEffectiveBonus + elementMods.enemyMod + timeModifier;

    const playerSnap: CombatRollSnapshot = {
      baseStat: input.playerCombatStat,
      luckRoll: playerLuckRoll.roll,
      luckBonus: playerEffectiveBonus,
      elementModifier: elementMods.playerMod,
      timeModifier: 0,
      effectModifier: equipmentBonus,
      total: playerTotal,
      critical: playerLuckRoll.critical,
    };

    const enemySnap: CombatRollSnapshot = {
      baseStat: enemyCombatStatValue,
      luckRoll: enemyLuckRoll.roll,
      luckBonus: enemyEffectiveBonus,
      elementModifier: elementMods.enemyMod,
      timeModifier,
      effectModifier: 0,
      total: enemyTotal,
      critical: enemyLuckRoll.critical,
    };

    // Both critical → tie (powers cancel out)
    if (playerLuckRoll.critical && enemyLuckRoll.critical) {
      return {
        outcome: "player-loss",
        playerRoll: playerSnap,
        enemyRoll: enemySnap,
        damage: 0,
        autoWin: false,
      };
    }

    // Player critical → auto-win, damage from inflated totals
    if (playerLuckRoll.critical) {
      return this.buildResult("player-win", playerSnap, enemySnap, Math.abs(playerTotal - enemyTotal), true);
    }

    // Enemy critical → auto-loss, damage from inflated totals
    if (enemyLuckRoll.critical) {
      return this.buildResult("player-loss", playerSnap, enemySnap, Math.abs(enemyTotal - playerTotal), true);
    }

    // Auto-win check based on base stats before modifiers
    const autoWin = this.checkAutoWin(input.playerCombatStat, enemyCombatStatValue);
    if (autoWin === "player") {
      return this.buildResult("player-win", playerSnap, enemySnap, Math.abs(playerTotal - enemyTotal), true);
    }
    if (autoWin === "enemy") {
      return this.buildResult("player-loss", playerSnap, enemySnap, Math.abs(enemyTotal - playerTotal), true);
    }

    // Normal resolution
    if (playerTotal > enemyTotal) {
      return {
        outcome: "player-win",
        playerRoll: playerSnap,
        enemyRoll: enemySnap,
        damage: playerTotal - enemyTotal,
        autoWin: false,
      };
    }

    if (enemyTotal > playerTotal) {
      return {
        outcome: "player-loss",
        playerRoll: playerSnap,
        enemyRoll: enemySnap,
        damage: enemyTotal - playerTotal,
        autoWin: false,
      };
    }

    // Tie — enemy stays, no damage
    return {
      outcome: "player-loss",
      playerRoll: playerSnap,
      enemyRoll: enemySnap,
      damage: 0,
      autoWin: false,
    };
  }

  public resolveFlee(input: ResolveFleeInput): CombatResult {
    const enemyCombatStatValue = input.enemy.combatStat === "strength"
      ? input.enemy.strength
      : input.enemy.magic;

    const playerLuckRoll = this.rollCombatLuck(input.playerLuck);
    const enemyLuckRoll = this.rollCombatLuck(input.enemy.luck);

    const playerFleeTotal = input.playerLuck + playerLuckRoll.bonus;
    const enemyFleeTotal = input.enemy.luck + enemyLuckRoll.bonus;

    const playerWins = playerFleeTotal > enemyFleeTotal;
    const outcome: CombatOutcome = playerWins ? "flee-lucky" : "flee";
    const damage = playerWins ? 0 : Math.ceil(enemyCombatStatValue / 2);

    const playerSnap: CombatRollSnapshot = {
      baseStat: input.playerLuck,
      luckRoll: playerLuckRoll.roll,
      luckBonus: playerLuckRoll.bonus,
      elementModifier: 0,
      timeModifier: 0,
      effectModifier: 0,
      total: playerFleeTotal,
      critical: playerLuckRoll.critical,
    };

    const enemySnap: CombatRollSnapshot = {
      baseStat: input.enemy.luck,
      luckRoll: enemyLuckRoll.roll,
      luckBonus: enemyLuckRoll.bonus,
      elementModifier: 0,
      timeModifier: 0,
      effectModifier: 0,
      total: enemyFleeTotal,
      critical: enemyLuckRoll.critical,
    };

    return { outcome, playerRoll: playerSnap, enemyRoll: enemySnap, damage, autoWin: false };
  }

  private buildResult(
    outcome: CombatOutcome,
    playerSnap: CombatRollSnapshot,
    enemySnap: CombatRollSnapshot,
    damage: number,
    autoWin: boolean,
  ): CombatResult {
    return {
      outcome,
      playerRoll: playerSnap,
      enemyRoll: enemySnap,
      damage: Math.max(0, Math.floor(damage)),
      autoWin,
    };
  }

  private rollCombatLuck(lck: number): { roll: number; bonus: number; critical: boolean } {
    const safeLck = Math.max(0, Math.floor(Number(lck)));
    const roll = this.randomIntInclusive(1, 100);
    const bonus = Math.max(1, Math.min(10, Math.floor((roll + safeLck) / 10)));
    return { roll, bonus, critical: roll === 100 };
  }

  private computeElementModifiers(
    playerElement: SanctuaryElement | undefined,
    enemyElement: ExplorationElement | undefined,
    quadrantElement: SanctuaryElement | undefined,
  ): { playerMod: number; enemyMod: number } {
    let playerMod = 0;
    let enemyMod = 0;

    // Head-to-head element advantage
    if (playerElement && enemyElement) {
      if (this.elementBeats(playerElement, enemyElement)) {
        playerMod += 1;
      } else if (this.elementBeats(enemyElement, playerElement)) {
        enemyMod += 1;
      }
    }

    // Quadrant sanctuary bonus: any entity of that element gets +1
    if (quadrantElement) {
      if (playerElement === quadrantElement) {
        playerMod += 1;
      }
      if (enemyElement === quadrantElement) {
        enemyMod += 1;
      }
    }

    return { playerMod, enemyMod };
  }

  private computeTimeModifier(enemyTime: PlacedEnemyCard["time"], timeOfDay: TimeOfDay): number {
    if (enemyTime === "both") return 0;
    if (enemyTime === timeOfDay) return 1;
    return -1;
  }

  private checkAutoWin(playerBase: number, enemyBase: number): "player" | "enemy" | null {
    const diff = playerBase - enemyBase;
    if (diff > AUTO_WIN_THRESHOLD) return "player";
    if (diff < -AUTO_WIN_THRESHOLD) return "enemy";
    return null;
  }

  // a beats b if a is one step ahead in the element chain
  private elementBeats(a: ExplorationElement, b: ExplorationElement): boolean {
    const ai = ELEMENT_CHAIN.indexOf(a);
    const bi = ELEMENT_CHAIN.indexOf(b);
    if (ai === -1 || bi === -1) return false;
    return (ai + 1) % ELEMENT_CHAIN.length === bi;
  }

  private randomIntInclusive(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
