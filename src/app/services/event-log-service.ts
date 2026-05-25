import { Injectable } from "@angular/core";
import { addDoc, collection, limit, onSnapshot, orderBy, query, Timestamp, Unsubscribe } from "firebase/firestore";
import { EVENT_LOG_CONFIG } from "../consts/logs/event-log-config";
import { EventLog, EventLogCode } from "../models/EventLog";
import { Player } from "../models/Player";
import { FirebaseService } from "./firebase-service";

interface EventLogContext {
    playerName: string;
    args: Record<string, unknown>;
}

type EventLogFormatter = (context: EventLogContext) => string;

@Injectable({
    providedIn: "root",
})
export class EventLogService {
    private readonly logFormatters: Record<string, EventLogFormatter> = {
        "system.info": ({ args }) => String(args["text"] ?? "System update"),
        "player.move": ({ playerName, args }) => {
            const x = Number(args["x"] ?? 0) + 1;
            const y = Number(args["y"] ?? 0) + 1;
            return `${playerName} moved to ${x}, ${y}.`;
        },
        "player.discoverBiome": ({ playerName, args }) => {
            const biome = String(args["biomeLabel"] ?? args["biome"] ?? "a biome");
            return `${playerName} discovered ${biome}.`;
        },
        "player.discoverEnvironment": ({ playerName, args }) => {
            const biome = String(args["biomeLabel"] ?? args["biome"] ?? "a biome");
            return `${playerName} discovered a new ${biome} environment.`;
        },
        "player.expandEnvironment": ({ playerName, args }) => {
            const biome = String(args["biomeLabel"] ?? args["biome"] ?? "a biome");
            return `${playerName} expanded a ${biome} environment.`;
        },
        "player.enterSanctuary": ({ playerName, args }) => {
            const sanctuary = String(args["sanctuaryLabel"] ?? "a sanctuary");
            return `${playerName} entered ${sanctuary}.`;
        },
        "player.gainExperience": ({ playerName, args }) => {
            const amount = Number(args["amount"] ?? 0);
            return `${playerName} gained ${amount} XP.`;
        },
    };

    constructor(private firebaseService: FirebaseService) { }

    public async newLog(
        gameId: string,
        player: Pick<Player, "id" | "name">,
        code: EventLogCode | (string & {}),
        args: Record<string, unknown> = {},
    ): Promise<void> {
        if (!gameId || !player.id) return;

        const playerName = this.sanitizePlayerName(player.name, player.id);
        const message = this.buildMessage(code, playerName, args);

        await addDoc(collection(this.firebaseService.database, "games", gameId, "logs"), {
            playerId: player.id,
            playerName,
            code,
            args,
            message,
            createdAt: Timestamp.now(),
        });
    }

    public listenLogs(
        gameId: string,
        onLogsChanged: (logs: EventLog[]) => void,
        maxEntries = EVENT_LOG_CONFIG.stream.maxEntries,
    ): Unsubscribe {
        const logsRef = collection(this.firebaseService.database, "games", gameId, "logs");
        const logsQuery = query(logsRef, orderBy("createdAt", "desc"), limit(Math.max(1, maxEntries)));

        return onSnapshot(logsQuery, (snapshot) => {
            const logs = snapshot.docs.map((logDoc) => {
                const data = logDoc.data() as Partial<EventLog>;
                return {
                    id: logDoc.id,
                    playerId: typeof data.playerId === "string" ? data.playerId : "",
                    playerName: typeof data.playerName === "string" ? data.playerName : "Unknown",
                    code: typeof data.code === "string" ? data.code : "system.info",
                    args: this.normalizeArgs(data.args),
                    message: typeof data.message === "string" ? data.message : "",
                    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now(),
                } satisfies EventLog;
            });

            onLogsChanged(logs);
        });
    }

    private buildMessage(code: string, playerName: string, args: Record<string, unknown>): string {
        const formatter = this.logFormatters[code];
        if (formatter) {
            return formatter({ playerName, args });
        }

        const details = this.serializeArgs(args);
        if (!details) return `${playerName} triggered ${code}.`;
        return `${playerName} triggered ${code}: ${details}.`;
    }

    private sanitizePlayerName(name: string, fallbackId: string): string {
        const trimmed = name.trim();
        if (trimmed) return trimmed;
        return fallbackId.slice(0, 6);
    }

    private normalizeArgs(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return {};
        }

        return value as Record<string, unknown>;
    }

    private serializeArgs(args: Record<string, unknown>): string {
        const entries = Object.entries(args);
        if (entries.length === 0) return "";

        return entries
            .map(([key, value]) => `${key}=${String(value)}`)
            .join(" | ");
    }
}
