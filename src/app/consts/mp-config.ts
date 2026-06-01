// Costanti per la gestione degli MP
export const MP_BASE_VALUE = 1;
export const MP_MAGIC_BASE = 3;
export const MP_MAGIC_INCREMENT = 1; // +1 MP per ogni punto magia sopra il base
export const MP_RECOVERY_PERCENT = 20; // 20% per turno

/**
 * Calcola il valore base degli MP dato il parametro magic.
 * @param magic valore del parametro magic del player
 * @returns valore base degli MP
 */
export function calculateMpBase(magic: number): number {
	return MP_BASE_VALUE + Math.max(0, (magic - MP_MAGIC_BASE) * MP_MAGIC_INCREMENT);
}
