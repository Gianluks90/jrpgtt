export interface SpecialCellCoordinate {
  x: number;
  y: number;
}

export const SPECIAL_CELLS: SpecialCellCoordinate[] = [
  { x: 3, y: 3 },
  { x: 6, y: 3 },
  { x: 3, y: 6 },
  { x: 6, y: 6 },
];

export function isSpecialCellCoordinate(x: number, y: number): boolean {
  return SPECIAL_CELLS.some((cell) => cell.x === x && cell.y === y);
}
