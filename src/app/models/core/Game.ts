import { Timestamp } from "firebase/firestore";

export interface Game {
    id: string;
    name: string;
    ownerId: string;
    joinCode: string;
    status: GameStatus;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    lastActivityAt: Timestamp;
    maxPlayers: number;
    playerIds: string[];
}

export type GameStatus =
    | 'waiting'
    | 'running'
    | 'ended';