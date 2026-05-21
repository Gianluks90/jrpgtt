export interface LobbyState {
    maxPlayers: number;
    isLocked: boolean;
    playersReady: Record<string, boolean>;
}