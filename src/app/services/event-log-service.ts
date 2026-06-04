import { Injectable } from "@angular/core";
import { addDoc, collection, limit, onSnapshot, orderBy, query, Timestamp, Unsubscribe } from "firebase/firestore";
import { EVENT_LOG_CONFIG } from "../consts/logs/event-log-config";
import { EventLog, EventLogCode } from "../models/EventLog";
import { Player } from "../models/Player";
import { ActionCatalogService } from "./action-catalog-service";
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
        "player.discoverLandmark": ({ playerName, args }) => {
            const landmarkName = String(args["landmarkName"] ?? "a landmark");
            return `${playerName} discovered ${landmarkName}.`;
        },
        "player.reachLandmark": ({ playerName, args }) => {
            const landmarkName = String(args["landmarkName"] ?? "a landmark");
            return `${playerName} reached ${landmarkName}.`;
        },
        "player.gainExperience": ({ playerName, args }) => {
            const amount = Number(args["amount"] ?? 0);
            return `${playerName} gained ${amount} XP.`;
        },
        "player.endTurn": ({ playerName }) => {
            return `${playerName} ended the turn.`;
        },
        "player.activateSanctuary": ({ playerName, args }) => {
            const sanctuary = String(args["sanctuaryLabel"] ?? "a sanctuary");
            return `${playerName} activated ${sanctuary} and attuned to its element.`;
        },
        "player.donateSanctuary": ({ playerName, args }) => {
            const sanctuary = String(args["sanctuaryLabel"] ?? "a sanctuary");
            return `${playerName} donated to ${sanctuary} and shifted attunement.`;
        },
        "player.praySanctuary": ({ playerName, args }) => {
            const sanctuary = String(args["sanctuaryLabel"] ?? "a sanctuary");
            const healedHp = Number(args["healedHp"] ?? 0);
            const lucky = Boolean(args["lucky"]);
            if (lucky) {
                return `${playerName} prayed at ${sanctuary} and restored ${healedHp} HP with a lucky blessing.`;
            }

            if (healedHp <= 0) {
                return `${playerName} prayed at ${sanctuary}, but received no healing response.`;
            }

            return `${playerName} prayed at ${sanctuary} and restored ${healedHp} HP.`;
        },
        "player.cellGather": ({ playerName, args }) => {
            const resource = String(args["resource"] ?? "resource");
            return `${playerName} spent 1 food and gathered ${resource}.`;
        },
        "player.chopTree": ({ playerName, args }) => {
            const resource = String(args["resource"] ?? "timber");
            const quantity = Math.max(1, Math.floor(Number(args["quantity"] ?? 1)));
            return `${playerName} chopped wood and gained ${quantity} ${resource}.`;
        },
        "player.consumeRation": ({ playerName }) => {
            return `${playerName} consumed a ration and gained Nutrition.`;
        },
        "player.safePlaceHeal": ({ playerName, args }) => {
            const actionId = String(args["actionId"] ?? "heal");
            const healedHp = Number(args["healedHp"] ?? 0);
            const spentCoins = Number(args["spentCoins"] ?? 0);
            const fallbackPlace = actionId === "capital-doctor" ? "Capital Doctor" : "City Healer";
            const place = this.getActionSourceLabel(actionId, fallbackPlace);
            return `${playerName} used ${place}, restored ${healedHp} HP and spent ${spentCoins} coins.`;
        },
        "player.capitalInn": ({ playerName, args }) => {
            const healedHp = Number(args["healedHp"] ?? 0);
            const spentCoins = Number(args["spentCoins"] ?? 0);
            const actionId = String(args["actionId"] ?? "capital-inn");
            const fallbackSource = actionId === "castle-rest" ? "Castle Rest" : "Capital Inn";
            const source = this.getActionSourceLabel(actionId, fallbackSource);
            return `${playerName} rested at the ${source}, restored ${healedHp} HP, spent ${spentCoins} coins and ended the turn.`;
        },
        "player.landmarkTraining": ({ playerName, args }) => {
            const actionId = String(args["actionId"] ?? "castle-trainer");
            const parameter = String(args["parameter"] ?? "strength");
            const spentCoins = Number(args["spentCoins"] ?? 0);
            const increasedBy = Number(args["increasedBy"] ?? 1);
            const newValue = Number(args["newValue"] ?? 0);
            const source = this.getActionSourceLabel(actionId, actionId === "academy-trainer" ? "Academy Trainer" : "Castle Trainer");
            return `${playerName} trained at ${source}, gained +${increasedBy} ${parameter} (now ${newValue}), spent ${spentCoins} coins, ended the turn and will skip the next turn.`;
        },
        "player.villageCraftsmanExchange": ({ playerName, args }) => {
            const giveLabel = String(args["giveLabel"] ?? "resource");
            const receiveLabel = String(args["receiveLabel"] ?? "resource");
            const amount = Number(args["amount"] ?? 0);
            const source = this.getActionSourceLabel("village-craftsman", "Village Craftsman");
            return `${playerName} exchanged ${amount} ${giveLabel} for ${amount} ${receiveLabel} at the ${source} and ended the turn.`;
        },
        "player.campReward": ({ playerName, args }) => {
            const actionId = String(args["actionId"] ?? "camp-action");
            const rewards = String(args["rewards"] ?? "");
            const fallbackSource = actionId === "camp-gatherer" ? "Camp Gatherer" : "Camp Hunter";
            const source = this.getActionSourceLabel(actionId, fallbackSource);
            return `${playerName} used ${source} and gained ${rewards}.`;
        },
        "player.safePlaceWait": ({ playerName, args }) => {
            const source = this.getActionSourceLabel("safe-place-wait", "Safe Place Wait");
            const place = String(args["place"] ?? "safe place");
            return `${playerName} waited at ${place} using ${source}, simulated movement on the same cell and ended the turn.`;
        },
        "player.capitalEnchantress": ({ playerName, args }) => {
            const source = this.getActionSourceLabel("capital-enchantress", "Capital Enchantress");
            const spentCoins = Number(args["spentCoins"] ?? 0);
            const rewardLabel = String(args["rewardLabel"] ?? "Arcane Fate");
            const pendingMagicReward = Boolean(args["pendingMagicReward"]);
            if (pendingMagicReward) {
                return `${playerName} consulted ${source}, paid ${spentCoins} coins, drew ${rewardLabel}, and unlocked a future magic reward placeholder.`;
            }

            return `${playerName} consulted ${source}, paid ${spentCoins} coins and drew ${rewardLabel}.`;
        },
        "player.cityMystic": ({ playerName, args }) => {
            const source = this.getActionSourceLabel("city-mystic", "City Mystic");
            const spentCoins = Number(args["spentCoins"] ?? 0);
            const rewardLabel = String(args["rewardLabel"] ?? "Fate");
            const alignment = typeof args["alignment"] === "string" ? String(args["alignment"]).toUpperCase() : "";
            const gainedExperience = Number(args["gainedExperience"] ?? 0);
            const grantedLevelUp = Boolean(args["grantedLevelUp"]);
            const extras: string[] = [];
            if (alignment) extras.push(`alignment: ${alignment}`);
            if (gainedExperience > 0) extras.push(`XP +${gainedExperience}`);
            if (grantedLevelUp) extras.push("+1 level up");
            const suffix = extras.length > 0 ? ` (${extras.join(", ")})` : "";
            return `${playerName} consulted ${source}, paid ${spentCoins} coins and drew ${rewardLabel}${suffix}.`;
        },
        "player.graveyardResurrect": ({ playerName, args }) => {
            const source = this.getActionSourceLabel("graveyard-resurrect", "Graveyard");
            const allyId = String(args["allyId"] ?? "ally");
            const rewardId = String(args["rewardId"] ?? "unknown");
            const appliedOutcome = String(args["appliedOutcome"] ?? rewardId);
            return `${playerName} attempted resurrection at ${source} for ${allyId}. Outcome: ${appliedOutcome}.`;
        },
        "player.templeSendDevotee": ({ playerName, args }) => {
            const source = this.getActionSourceLabel("temple-send-devotee", "Temple");
            const gainedExperience = Math.max(0, Math.floor(Number(args["gainedExperience"] ?? 0)));
            return `${playerName} sent a devotee at ${source}, became GOOD and gained ${gainedExperience} XP.`;
        },
        "player.altarSacrifice": ({ playerName, args }) => {
            const source = this.getActionSourceLabel("altar-sacrifice", "Altar");
            const gainedExperience = Math.max(0, Math.floor(Number(args["gainedExperience"] ?? 0)));
            return `${playerName} performed a sacrifice at ${source}, became EVIL and gained ${gainedExperience} XP.`;
        },
        "player.eliminateZombie": ({ playerName }) => {
            const source = this.getActionSourceLabel("eliminate-zombie", "Zombie");
            return `${playerName} used ${source} and eliminated the active zombie.`;
        },
        "player.merchantBuy": ({ playerName, args }) => {
            const source = this.getActionSourceLabel(String(args["actionId"] ?? "city-merchant"), "Merchant");
            const itemName = String(args["itemName"] ?? "item");
            const quantity = Math.max(1, Math.floor(Number(args["quantity"] ?? 1)));
            const spentCoins = Number(args["spentCoins"] ?? 0);
            const quantityLabel = quantity > 1 ? ` x${quantity}` : "";
            return `${playerName} bought ${itemName}${quantityLabel} from ${source} for ${spentCoins} coins and ended the turn.`;
        },
        "player.merchantSell": ({ playerName, args }) => {
            const source = this.getActionSourceLabel(String(args["actionId"] ?? "city-merchant"), "Merchant");
            const itemName = String(args["itemName"] ?? "item");
            const quantity = Math.max(1, Math.floor(Number(args["quantity"] ?? 1)));
            const gainedCoins = Number(args["gainedCoins"] ?? 0);
            const quantityLabel = quantity > 1 ? ` x${quantity}` : "";
            return `${playerName} sold ${itemName}${quantityLabel} to ${source} for ${gainedCoins} coins.`;
        },
        "player.fastTravelBooked": ({ playerName, args }) => {
            const from = String(args["from"] ?? "a safe place");
            const to = String(args["to"] ?? "a safe place");
            const spentCoins = Number(args["spentCoins"] ?? 0);
            const skippedTurns = Math.max(1, Number(args["skippedTurns"] ?? 1));
            const source = this.getActionSourceLabel("fast-travel", "Fast Travel");
            const turnLabel = skippedTurns === 1 ? "turn" : "turns";
            return `${playerName} booked ${source} from ${from} to ${to}, spent ${spentCoins} coins and will skip ${skippedTurns} ${turnLabel} before arriving.`;
        },
        "player.hostileEnvironmentDamage": ({ playerName, args }) => {
            const damageHp = Number(args["damageHp"] ?? 0);
            const environmentSize = Number(args["environmentSize"] ?? 1);
            return `${playerName} suffered ${damageHp} HP from hostile desert (environment size ${environmentSize}).`;
        },
        "player.regeneratingWatersHealing": ({ playerName, args }) => {
            const healingHp = Number(args["healingHp"] ?? 0);
            const environmentSize = Number(args["environmentSize"] ?? 1);
            return `${playerName} healed ${healingHp} HP from regenerating waters (environment size ${environmentSize}).`;
        },
        "player.allyHostileEnvironmentDamage": ({ playerName, args }) => {
            const allyName = String(args["allyName"] ?? args["allyId"] ?? "ally");
            const damageHp = Number(args["damageHp"] ?? 0);
            const environmentSize = Number(args["environmentSize"] ?? 1);
            return `${playerName}'s ally ${allyName} suffered ${damageHp} HP from hostile desert (environment size ${environmentSize}).`;
        },
        "player.allyRegeneratingWatersHealing": ({ playerName, args }) => {
            const allyName = String(args["allyName"] ?? args["allyId"] ?? "ally");
            const healingHp = Number(args["healingHp"] ?? 0);
            const environmentSize = Number(args["environmentSize"] ?? 1);
            return `${playerName}'s ally ${allyName} healed ${healingHp} HP from regenerating waters (environment size ${environmentSize}).`;
        },
        "player.discardResource": ({ playerName, args }) => {
            const resource = String(args["resource"] ?? "resource");
            return `${playerName} discarded 1 ${resource}.`;
        },
        "player.pendingPickupCancelled": ({ playerName, args }) => {
            const resource = String(args["resource"] ?? "resource");
            return `${playerName} cancelled collecting pending ${resource}.`;
        },
        "player.swapResource": ({ playerName, args }) => {
            const droppedResource = String(args["droppedResource"] ?? "resource");
            const gainedResource = String(args["gainedResource"] ?? "resource");
            return `${playerName} discarded ${droppedResource} and collected ${gainedResource}.`;
        },
        "player.resolvePendingPickup": ({ playerName, args }) => {
            const resource = String(args["resource"] ?? "resource");
            return `${playerName} collected pending ${resource}.`;
        },
    };

    constructor(
        private firebaseService: FirebaseService,
        private actionCatalogService: ActionCatalogService,
    ) { }

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

    private getActionSourceLabel(actionId: string, fallbackLabel: string): string {
        return this.actionCatalogService.getLogSourceLabel(actionId, fallbackLabel);
    }
}
