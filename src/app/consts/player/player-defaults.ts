import { PlayerParameters } from "@models/player/Player";
import { calculateMpBase } from './mp-config';

/**
 * Costruisce i parametri del player (hp/mp/strength/magic/luck) secondo le regole di setup.
 */
export function buildPlayerParameters(strength: number, magic: number, luck: number): PlayerParameters {
	// HP: base 80 +5% per ogni punto strength sopra 3
	const hpBase = PLAYER_SETUP_BASE_HP + Math.max(0, strength - 3) * 5;
	// MP: base 1 +1 per ogni punto magic sopra 3
	const mpBase = calculateMpBase(magic);
	return {
		hp: { base: hpBase, current: hpBase, max: hpBase },
		mp: { base: mpBase, current: mpBase, max: mpBase },
		strength: { base: strength, current: strength },
		magic: { base: magic, current: magic },
		luck: { base: luck, current: luck },
	};
}
export const PLAYER_STARTING_MONEY = 5;
export const PLAYER_SETUP_BASE_HP = 80;
