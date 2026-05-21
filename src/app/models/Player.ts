export interface Player {
    id: string;
    name: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    isReady: boolean;
    color: string;
    joinedAt: number;
}