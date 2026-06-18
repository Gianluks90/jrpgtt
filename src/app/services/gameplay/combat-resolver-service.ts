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

    const playerTotal = input.playerCombatStat
      + playerLuckRoll.bonus
      + elementMods.playerMod;

    const enemyTotal = enemyCombatStatValue
      + enemyLuckRoll.bonus
      + elementMods.enemyMod
      + timeModifier;

    const playerSnap: CombatRollSnapshot = {
      baseStat: input.playerCombatStat,
      luckRoll: playerLuckRoll.roll,
      luckBonus: playerLuckRoll.bonus,
      elementModifier: elementMods.playerMod,
      timeModifier: 0,
      effectModifier: 0,
      total: playerTotal,
      critical: playerLuckRoll.critical,
    };

    const enemySnap: CombatRollSnapshot = {
      baseStat: enemyCombatStatValue,
      luckRoll: enemyLuckRoll.roll,
      luckBonus: enemyLuckRoll.bonus,
      elementModifier: elementMods.enemyMod,
      timeModifier,
      effectModifier: 0,
      total: enemyTotal,
      critical: enemyLuckRoll.critical,
    };

    // Both critical → tie
    if (playerLuckRoll.critical && enemyLuckRoll.critical) {
      return {
        outcome: "player-loss",
        playerRoll: playerSnap,
        enemyRoll: enemySnap,
        damage: 0,
        autoWin: false,
      };
    }

    // Player critical → auto-win, max damage
    if (playerLuckRoll.critical) {
      return this.buildResult("player-win", playerSnap, enemySnap, input.playerCombatStat, true);
    }

    // Enemy critical → auto-loss, max damage
    if (enemyLuckRoll.critical) {
      return this.buildResult("player-loss", playerSnap, enemySnap, enemyCombatStatValue, true);
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

    const fleeRoll = this.randomIntInclusive(1, 100);
    const fleeTotal = fleeRoll + Math.max(0, Math.floor(input.playerLuck));
    const isLucky = fleeTotal >= 100;

    const fullDamage = enemyCombatStatValue;
    const damage = isLucky ? Math.ceil(fullDamage / 2) : fullDamage;
    const outcome: CombatOutcome = isLucky ? "flee-lucky" : "flee";

    const playerSnap: CombatRollSnapshot = {
      baseStat: 0,
      luckRoll: fleeRoll,
      luckBonus: 0,
      elementModifier: 0,
      timeModifier: 0,
      effectModifier: 0,
      total: fleeTotal,
      critical: false,
    };

    const enemySnap: CombatRollSnapshot = {
      baseStat: enemyCombatStatValue,
      luckRoll: 0,
      luckBonus: 0,
      elementModifier: 0,
      timeModifier: 0,
      effectModifier: 0,
      total: enemyCombatStatValue,
      critical: false,
    };

    return {
      outcome,
      playerRoll: playerSnap,
      enemyRoll: enemySnap,
      damage,
      autoWin: false,
    };
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
