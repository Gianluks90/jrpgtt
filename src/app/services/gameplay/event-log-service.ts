import { Injectable } from "@angular/core";
import { addDoc, collection, limit, onSnapshot, orderBy, query, Timestamp, Unsubscribe } from "firebase/firestore";
import { EVENT_LOG_CONFIG } from "../../consts/app-logs/event-log-config";
import { EventLog, EventLogCode } from "@models/ui/EventLog";
import { Player } from "@models/player/Player";
import { ActionCatalogService } from "@services/catalog/action-catalog-service";
import { FollowerCatalogService } from "@services/catalog/follower-catalog-service";
import { FirebaseService } from "@services/app/firebase-service";
import { ItemCatalogService } from "@services/catalog/item-catalog-service";
import { SpellCatalogService } from "@services/catalog/spell-catalog-service";
import { ExplorationCatalogService } from "@services/catalog/exploration-catalog-service";
import { TranslationService } from "@services/shared/translation-service";

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
        "player.worldEventTriggered": ({ playerName, args }) => {
            const eventTitle = String(args["eventTitleLabel"] ?? args["eventTitle"] ?? "World Event");
            const outcome = String(args["outcomeLabel"] ?? args["outcome"] ?? "-");
            const target = String(args["targetBiomeLabel"] ?? args["targetBiome"] ?? "-");
            const driver = String(args["driverBiomeLabel"] ?? args["driverBiome"] ?? "-");
            const activeShrines = Number(args["activeShrinesInRegionI"] ?? 0);
            return `${playerName} triggered ${eventTitle}: ${outcome}. Target ${target}, driver ${driver}, active shrines in Region I: ${activeShrines}.`;
        },
        "player.worldEventMutationSummary": ({ playerName, args }) => {
            const cellsMutated = Number(args["cellsMutated"] ?? 0);
            const cellsAffected = Number(args["cellsAffected"] ?? 0);
            return `${playerName} completed World Event mutation: ${cellsMutated}/${cellsAffected} cells changed.`;
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
        "player.academySpellUpgrade": ({ playerName, args }) => {
            const source = this.getActionSourceLabel("academy-spell-upgrader", "Spell Master");
            const fromSpellName = String(args["fromSpellName"] ?? "");
            const toSpellName = String(args["toSpellName"] ?? "");
            const spentCoins = Number(args["spentCoins"] ?? 0);
            return `${playerName} upgraded ${fromSpellName}→${toSpellName} at ${source}, paid ${spentCoins} coins and ended the turn.`;
        },
        "player.capitalEnchantress": ({ playerName, args }) => {
            const source = this.getActionSourceLabel("capital-enchantress", "Capital Enchantress");
            const spentCoins = Number(args["spentCoins"] ?? 0);
            const rewardLabel = String(args["rewardLabel"] ?? "Arcane Fate");
            const learnedSpellName = String(args["learnedSpellName"] ?? "");
            if (learnedSpellName) {
                return `${playerName} consulted ${source}, paid ${spentCoins} coins, drew ${rewardLabel} and learned the spell: ${learnedSpellName}.`;
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
            const followerName = this.resolveFollowerName(args);
            const rewardId = String(args["rewardId"] ?? "unknown");
            const appliedOutcome = String(args["appliedOutcome"] ?? rewardId);
            return `${playerName} attempted resurrection at ${source} for ${followerName}. Outcome: ${appliedOutcome}.`;
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
        "player.elementalRitual": ({ playerName, args }) => {
            const source = this.getActionSourceLabel("elemental-ritual", "Altar");
            const followerName = this.resolveFollowerName(args);
            return `${playerName} performed the Elemental Ritual at ${source} on ${followerName}.`;
        },
        "player.eliminateZombie": ({ playerName }) => {
            const source = this.getActionSourceLabel("eliminate-zombie", "Zombie");
            return `${playerName} used ${source} and eliminated the active zombie.`;
        },
        "player.castSpellDiagonal": ({ playerName, args }) => {
            const spellName = String(args["spellName"] ?? "spell");
            const spentMp = Number(args["spentMp"] ?? 0);
            return `${playerName} cast ${spellName}, enabling diagonal movement (−${spentMp} MP).`;
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
        "player.followerHostileEnvironmentDamage": ({ playerName, args }) => {
            const followerName = this.resolveFollowerName(args);
            const damageHp = Number(args["damageHp"] ?? 0);
            const environmentSize = Number(args["environmentSize"] ?? 1);
            return `${playerName}'s follower ${followerName} suffered ${damageHp} HP from hostile desert (environment size ${environmentSize}).`;
        },
        "player.followerRegeneratingWatersHealing": ({ playerName, args }) => {
            const followerName = this.resolveFollowerName(args);
            const healingHp = Number(args["healingHp"] ?? 0);
            const environmentSize = Number(args["environmentSize"] ?? 1);
            return `${playerName}'s follower ${followerName} healed ${healingHp} HP from regenerating waters (environment size ${environmentSize}).`;
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
        "player.combatResult": ({ playerName, args }) => {
            const enemy = String(args["enemy"] ?? "unknown enemy");
            const outcome = String(args["outcome"] ?? "");
            const damage = Number(args["damage"] ?? 0);
            const xp = Number(args["xp"] ?? 0);
            if (outcome === "player-win") return `${playerName} defeated ${enemy} (+${xp} XP).`;
            if (outcome === "player-loss") return `${playerName} was defeated by ${enemy} (−${damage} HP).`;
            if (outcome === "flee-lucky") return `${playerName} luckily escaped from ${enemy} without taking damage.`;
            return `${playerName} fled from ${enemy} (−${damage} HP).`;
        },
        "player.followerDismissed": ({ playerName, args }) => {
            const followerName = this.resolveFollowerName(args);
            return `${playerName} dismissed ${followerName} and ended the turn.`;
        },
        "player.alchimistaHeal": ({ playerName }) => `${playerName} used the Alchemist's Healing Potion.`,
        "player.alchimistaMana": ({ playerName }) => `${playerName} used the Alchemist's Mana Potion (+2 MP).`,
        "player.hireMercenary": ({ playerName }) => `${playerName} hired the Mercenary for 3 coins (+2 STR this combat).`,
        "player.strangerHealPercent": ({ playerName, args }) => `${playerName} was healed by the Healer (+${Number(args["healedHp"] ?? 0)} HP).`,
        "player.strangerEnchantress": ({ playerName, args }) => `${playerName} was affected by the Witch's ritual: ${String(args["rewardLabel"] ?? "")}.`,
        "player.strangerWishCoins": ({ playerName, args }) => `${playerName} wished for coins and gained ${Number(args["amount"] ?? 0)} coins.`,
        "player.strangerWishXp": ({ playerName, args }) => `${playerName} wished for experience and gained ${Number(args["amount"] ?? 0)} XP.`,
        "player.strangerWishStat": ({ playerName, args }) => `${playerName} wished for power and gained +1 ${String(args["stat"] ?? "")} permanently.`,
        "player.strangerWishTeleport": ({ playerName, args }) => `${playerName} wished to travel and teleported to (${Number(args["targetX"] ?? 0)},${Number(args["targetY"] ?? 0)}).`,
        "player.strangerHermitMoved": ({ playerName }) => `${playerName} encountered the Hermit, who vanished to a distant place.`,
        "player.strangerHermitAmulet": ({ playerName }) => `${playerName} found the Hermit again and received a Talisman!`,
        "player.strangerSpellTeacher": ({ playerName, args }) => `${playerName} learned the spell ${this.resolveSpellName(args)} from ${String(args["source"] ?? "a stranger")}.`,
        "player.strangerSpellTeacherFull": ({ playerName }) => `${playerName} tried to learn a spell but the spellbook is full.`,
        "player.strangerSpellTeacherEmpty": ({ playerName }) => `${playerName} tried to learn a spell but the spell deck is empty.`,
        "player.placeFountainDamage": ({ playerName, args }) => `${playerName} drank from the fountain and took ${Number(args["damage"] ?? 0)} damage. (${Number(args["usesLeft"] ?? 0)} uses left)`,
        "player.placeFountainStatBoost": ({ playerName, args }) => `${playerName} drank from the fountain and gained +${Number(args["amount"] ?? 0)} ${String(args["stat"] ?? "")} permanently!`,
        "player.placeFountainHpBoost": ({ playerName }) => `${playerName} drank from the fountain and increased their max HP by 5%!`,
        "player.placeFountainExhausted": ({ args }) => `The ${String(args["placeName"] ?? "Fountain")} has run dry after 3 uses and vanished.`,
        "player.placePortal": ({ playerName, args }) => `${playerName} stepped through the Magic Portal and was teleported to ${String(args["destination"] ?? "")}.`,
        "player.placePortalNoDestination": ({ playerName }) => `${playerName} tried to step through the Magic Portal but no special places had been discovered.`,
        "player.placeMazeLost": ({ playerName }) => `${playerName} got lost in the Labyrinth and will skip their next turn.`,
        "player.placeMazeEscape": ({ playerName }) => `${playerName} escaped the Labyrinth. The turn ends.`,
        "player.placeCaveDamage": ({ playerName, args }) => `${playerName} explored the Cave and took ${Number(args["damage"] ?? 0)} damage.`,
        "player.placeCaveNothing": ({ playerName }) => `${playerName} explored the Cave but found nothing.`,
        "player.placeCaveCoins": ({ playerName, args }) => `${playerName} explored the Cave and found ${Number(args["amount"] ?? 0)} coins.`,
        "player.placeCaveXp": ({ playerName }) => `${playerName} explored the Cave and gained 1 XP.`,
        "player.placeChapelNothing": ({ playerName }) => `${playerName} prayed at the Chapel but nothing happened.`,
        "player.placeChapelFortune": ({ playerName }) => `${playerName} prayed at the Chapel and received the Fortune blessing for 2 turns.`,
        "player.placeChapelCoins": ({ playerName }) => `${playerName} prayed at the Chapel and received 5 coins.`,
        "player.placeChapelHeal": ({ playerName, args }) => `${playerName} prayed at the Chapel and recovered ${Number(args["healedHp"] ?? 0)} HP.`,
        "player.placeChapelSpell": ({ playerName, args }) => `${playerName} prayed at the Chapel and learned the spell ${this.resolveSpellName(args)}.`,
        "player.placeChapelSpellFull": ({ playerName }) => `${playerName} prayed at the Chapel but the spellbook is full.`,
        "player.placeChapelSpellEmpty": ({ playerName }) => `${playerName} prayed at the Chapel but the spell deck is empty.`,
        "player.placeChapelTeleport": ({ playerName }) => `${playerName} prayed at the Chapel and will receive a free teleport on their next move.`,
        "player.placeChapelActivatedTeleport": ({ playerName, args }) => `${playerName} used the Chapel blessing and teleported to (${Number(args["targetX"] ?? 0)}, ${Number(args["targetY"] ?? 0)}).`,
        "player.placeSwampPoison": ({ playerName }) => `${playerName} ended their turn in the Swamp and was Poisoned.`,
    };

    constructor(
        private firebaseService: FirebaseService,
        private actionCatalogService: ActionCatalogService,
        private itemCatalogService: ItemCatalogService,
        private followerCatalogService: FollowerCatalogService,
        private spellCatalogService: SpellCatalogService,
        private explorationCatalogService: ExplorationCatalogService,
        private translationService: TranslationService,
    ) { }

    public async newLog(
        gameId: string,
        player: Pick<Player, "id" | "name">,
        code: EventLogCode | (string & {}),
        args: Record<string, unknown> = {},
    ): Promise<void> {
        if (!gameId || !player.id) return;

        const playerName = this.sanitizePlayerName(player.name, player.id);
        await addDoc(collection(this.firebaseService.database, "games", gameId, "logs"), {
            playerId: player.id,
            playerName,
            code,
            args,
            // Keep message encoded client-side (code + args) so each player can render in local language.
            message: "",
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
                const playerName = typeof data.playerName === "string" ? data.playerName : "Unknown";
                const code = typeof data.code === "string" ? data.code : "system.info";
                const args = this.normalizeArgs(data.args);
                const storedMessage = typeof data.message === "string" ? data.message : "";
                return {
                    id: logDoc.id,
                    playerId: typeof data.playerId === "string" ? data.playerId : "",
                    playerName,
                    code,
                    args,
                    message: this.localizeMessage(code, playerName, args, storedMessage),
                    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now(),
                } satisfies EventLog;
            });

            onLogsChanged(logs);
        });
    }

    public localizeEventLog(log: Pick<EventLog, "code" | "playerName" | "args" | "message">): string {
        return this.localizeMessage(log.code, log.playerName, this.normalizeArgs(log.args), log.message);
    }

    private localizeMessage(
        code: string,
        playerName: string,
        args: Record<string, unknown>,
        storedMessage: string,
    ): string {
        const fallbackMessage = this.buildFallbackMessage(code, playerName, args);
        const fallback = storedMessage.trim().length > 0 ? storedMessage : fallbackMessage;

        const baseParams: Record<string, string | number> = {
            playerName,
            ...this.stringifyArgs(args),
        };

        if (code === "system.info") {
            const textKey = typeof args["textKey"] === "string" ? String(args["textKey"]) : "";
            const rawTextParams = this.normalizeTemplateParams(args["textParams"]);
            const textParams = this.enrichSystemInfoParams(textKey, rawTextParams);
            if (textKey) {
                return this.translationService.tOrFallback(textKey, fallback, textParams);
            }

            return this.translationService.tOrFallback("logs.system.info", fallback, {
                text: String(args["text"] ?? fallback),
                ...baseParams,
            });
        }

        if (code === "player.move") {
            const x = Math.max(1, Math.floor(Number(args["x"] ?? 0)) + 1);
            const y = Math.max(1, Math.floor(Number(args["y"] ?? 0)) + 1);
            return this.translationService.tOrFallback("logs.player.move", fallback, { ...baseParams, x, y });
        }

        if (code === "player.discoverBiome" || code === "player.discoverEnvironment" || code === "player.expandEnvironment") {
            const biome = this.resolveBiomeLabel(args);
            const key = code === "player.discoverBiome"
                ? "logs.player.discoverBiome"
                : code === "player.discoverEnvironment"
                    ? "logs.player.discoverEnvironment"
                    : "logs.player.expandEnvironment";
            return this.translationService.tOrFallback(key, fallback, { ...baseParams, biome });
        }

        if (code === "player.worldEventTriggered") {
            const eventTitle = this.resolveWorldEventTitleLabel(args["eventTitle"]);
            const outcome = this.resolveWorldEventOutcomeLabel(args["outcome"]);
            const targetBiome = this.resolveBiomeLabel({ biome: args["targetBiome"] });
            const driverBiome = this.resolveBiomeLabel({ biome: args["driverBiome"] });
            return this.translationService.tOrFallback("logs.player.worldEventTriggered", fallback, {
                ...baseParams,
                eventTitle,
                outcome,
                targetBiome,
                driverBiome,
                activeShrinesInRegionI: Number(args["activeShrinesInRegionI"] ?? 0),
            });
        }

        if (code === "player.worldEventMutationSummary") {
            return this.translationService.tOrFallback("logs.player.worldEventMutationSummary", fallback, {
                ...baseParams,
                cellsMutated: Number(args["cellsMutated"] ?? 0),
                cellsAffected: Number(args["cellsAffected"] ?? 0),
            });
        }

        if (code === "player.enterSanctuary") {
            const sanctuary = this.resolveSanctuaryLabel(args);
            return this.translationService.tOrFallback("logs.player.enterSanctuary", fallback, { ...baseParams, sanctuary });
        }

        if (code === "player.activateSanctuary" || code === "player.donateSanctuary") {
            const sanctuaryLabel = this.resolveSanctuaryLabel(args);
            const key = code === "player.activateSanctuary"
                ? "logs.player.activateSanctuary"
                : "logs.player.donateSanctuary";
            return this.translationService.tOrFallback(key, fallback, { ...baseParams, sanctuaryLabel });
        }

        if (code === "player.discoverLandmark" || code === "player.reachLandmark") {
            const landmark = this.resolveLandmarkLabel(args);
            const key = code === "player.discoverLandmark" ? "logs.player.discoverLandmark" : "logs.player.reachLandmark";
            return this.translationService.tOrFallback(key, fallback, { ...baseParams, landmark });
        }

        if (code === "player.praySanctuary") {
            const sanctuary = this.resolveSanctuaryLabel(args);
            const healedHp = Number(args["healedHp"] ?? 0);
            const lucky = Boolean(args["lucky"]);
            if (lucky) {
                return this.translationService.tOrFallback(
                    "logs.player.praySanctuary.lucky",
                    fallback,
                    { ...baseParams, sanctuary, healedHp },
                );
            }

            if (healedHp <= 0) {
                return this.translationService.tOrFallback(
                    "logs.player.praySanctuary.noHeal",
                    fallback,
                    { ...baseParams, sanctuary },
                );
            }

            return this.translationService.tOrFallback(
                "logs.player.praySanctuary.heal",
                fallback,
                { ...baseParams, sanctuary, healedHp },
            );
        }

        if (code === "player.capitalEnchantress") {
            const source = this.getLocalizedActionLabel("capital-enchantress", "Capital Enchantress");
            const spentCoins = Number(args["spentCoins"] ?? 0);
            const rewardLabel = String(args["rewardLabel"] ?? "Arcane Fate");
            const learnedSpellName = String(args["learnedSpellName"] ?? "");
            const key = learnedSpellName
                ? "logs.player.capitalEnchantress.spell"
                : "logs.player.capitalEnchantress";
            return this.translationService.tOrFallback(key, fallback, {
                ...baseParams,
                source,
                spentCoins,
                rewardLabel,
                learnedSpellName,
            });
        }

        if (code === "player.cityMystic") {
            const source = this.getLocalizedActionLabel("city-mystic", "City Mystic");
            const spentCoins = Number(args["spentCoins"] ?? 0);
            const rewardLabel = String(args["rewardLabel"] ?? "Fate");
            const alignmentRaw = typeof args["alignment"] === "string" ? String(args["alignment"]) : "";
            const alignment = alignmentRaw ? this.resolveAlignmentLabel(alignmentRaw) : "";
            const gainedExperience = Number(args["gainedExperience"] ?? 0);
            const grantedLevelUp = Boolean(args["grantedLevelUp"]);
            const extrasParts: string[] = [];
            if (alignment) {
                extrasParts.push(this.translationService.tOrFallback("logs.tokens.alignment", "alignment: {value}", { value: alignment }));
            }
            if (gainedExperience > 0) {
                extrasParts.push(this.translationService.tOrFallback("logs.tokens.gainXp", "XP +{value}", { value: gainedExperience }));
            }
            if (grantedLevelUp) {
                extrasParts.push(this.translationService.tOrFallback("logs.tokens.gainLevelUp", "+1 level up"));
            }
            const extras = extrasParts.length > 0
                ? this.translationService.tOrFallback("logs.tokens.extrasWrapper", " ({value})", { value: extrasParts.join(", ") })
                : "";
            return this.translationService.tOrFallback("logs.player.cityMystic", fallback, {
                ...baseParams,
                source,
                spentCoins,
                rewardLabel,
                extras,
            });
        }

        if (code === "player.safePlaceHeal") {
            const actionId = String(args["actionId"] ?? "heal");
            const fallbackPlace = actionId === "capital-doctor" ? "Capital Doctor" : "City Healer";
            const source = this.getLocalizedActionLabel(actionId, fallbackPlace);
            return this.translationService.tOrFallback("logs.player.safePlaceHeal", fallback, {
                ...baseParams,
                source,
                healedHp: Number(args["healedHp"] ?? 0),
                spentCoins: Number(args["spentCoins"] ?? 0),
            });
        }

        if (code === "player.capitalInn") {
            const actionId = String(args["actionId"] ?? "capital-inn");
            const fallbackSource = actionId === "castle-rest" ? "Castle Rest" : "Capital Inn";
            const source = this.getLocalizedActionLabel(actionId, fallbackSource);
            return this.translationService.tOrFallback("logs.player.capitalInn", fallback, {
                ...baseParams,
                source,
                healedHp: Number(args["healedHp"] ?? 0),
                spentCoins: Number(args["spentCoins"] ?? 0),
            });
        }

        if (code === "player.landmarkTraining") {
            const actionId = String(args["actionId"] ?? "castle-trainer");
            const source = this.getLocalizedActionLabel(actionId, actionId === "academy-trainer" ? "Academy Trainer" : "Castle Trainer");
            return this.translationService.tOrFallback("logs.player.landmarkTraining", fallback, {
                ...baseParams,
                source,
                parameter: String(args["parameter"] ?? "strength"),
                spentCoins: Number(args["spentCoins"] ?? 0),
                increasedBy: Number(args["increasedBy"] ?? 1),
                newValue: Number(args["newValue"] ?? 0),
            });
        }

        if (code === "player.villageCraftsmanExchange") {
            const source = this.getLocalizedActionLabel("village-craftsman", "Village Craftsman");
            return this.translationService.tOrFallback("logs.player.villageCraftsmanExchange", fallback, {
                ...baseParams,
                source,
                giveLabel: this.resolveResourceLabel(args["giveLabel"]),
                receiveLabel: this.resolveResourceLabel(args["receiveLabel"]),
                amount: Number(args["amount"] ?? 0),
            });
        }

        if (code === "player.campReward") {
            const actionId = String(args["actionId"] ?? "camp-action");
            const fallbackSource = actionId === "camp-gatherer" ? "Camp Gatherer" : "Camp Hunter";
            const source = this.getLocalizedActionLabel(actionId, fallbackSource);
            return this.translationService.tOrFallback("logs.player.campReward", fallback, {
                ...baseParams,
                source,
                rewards: String(args["rewards"] ?? ""),
            });
        }

        if (code === "player.safePlaceWait") {
            const source = this.getLocalizedActionLabel("safe-place-wait", "Safe Place Wait");
            return this.translationService.tOrFallback("logs.player.safePlaceWait", fallback, {
                ...baseParams,
                source,
                place: String(args["place"] ?? "safe place"),
            });
        }

        if (code === "player.cellGather") {
            return this.translationService.tOrFallback("logs.player.cellGather", fallback, {
                ...baseParams,
                resource: this.resolveResourceLabel(args["resource"]),
            });
        }

        if (code === "player.chopTree") {
            return this.translationService.tOrFallback("logs.player.chopTree", fallback, {
                ...baseParams,
                resource: this.resolveResourceLabel(args["resource"]),
                quantity: Math.max(1, Math.floor(Number(args["quantity"] ?? 1))),
            });
        }

        if (code === "player.graveyardResurrect") {
            const source = this.getLocalizedActionLabel("graveyard-resurrect", "Graveyard");
            return this.translationService.tOrFallback("logs.player.graveyardResurrect", fallback, {
                ...baseParams,
                source,
                followerId: this.resolveFollowerName(args),
                appliedOutcome: String(args["appliedOutcome"] ?? args["rewardId"] ?? "unknown"),
            });
        }

        if (code === "player.eliminateZombie") {
            const source = this.getLocalizedActionLabel("eliminate-zombie", "Zombie");
            return this.translationService.tOrFallback("logs.player.eliminateZombie", fallback, {
                ...baseParams,
                source,
            });
        }

        if (code === "player.merchantBuy") {
            const actionId = String(args["actionId"] ?? "city-merchant");
            const source = this.getLocalizedActionLabel(actionId, "Merchant");
            const quantity = Math.max(1, Math.floor(Number(args["quantity"] ?? 1)));
            const quantityLabel = quantity > 1 ? ` x${quantity}` : "";
            return this.translationService.tOrFallback("logs.player.merchantBuy", fallback, {
                ...baseParams,
                source,
                itemName: this.resolveItemName(args),
                quantityLabel,
                spentCoins: Number(args["spentCoins"] ?? 0),
            });
        }

        if (code === "player.merchantSell") {
            const actionId = String(args["actionId"] ?? "city-merchant");
            const source = this.getLocalizedActionLabel(actionId, "Merchant");
            const quantity = Math.max(1, Math.floor(Number(args["quantity"] ?? 1)));
            const quantityLabel = quantity > 1 ? ` x${quantity}` : "";
            return this.translationService.tOrFallback("logs.player.merchantSell", fallback, {
                ...baseParams,
                source,
                itemName: this.resolveItemName(args),
                quantityLabel,
                gainedCoins: Number(args["gainedCoins"] ?? 0),
            });
        }

        if (code === "player.fastTravelBooked") {
            const source = this.getLocalizedActionLabel("fast-travel", "Fast Travel");
            const skippedTurns = Math.max(1, Number(args["skippedTurns"] ?? 1));
            const turnLabel = skippedTurns === 1
                ? this.translationService.tOrFallback("logs.tokens.turn.one", "turn")
                : this.translationService.tOrFallback("logs.tokens.turn.many", "turns");
            return this.translationService.tOrFallback("logs.player.fastTravelBooked", fallback, {
                ...baseParams,
                source,
                skippedTurns,
                turnLabel,
            });
        }

        if (code === "player.explorationPickupItem") {
            return this.translationService.tOrFallback("logs.player.explorationPickupItem", fallback, {
                ...baseParams,
                itemName: this.resolveItemName(args),
            });
        }

        if (code === "player.explorationEvent") {
            const cardId = String(args["cardId"] ?? "");
            const cardDef = cardId ? this.explorationCatalogService.getCardDef(cardId) : null;
            const cardName = cardDef
                ? (cardDef.nameKey ? this.translationService.tOrFallback(cardDef.nameKey, cardDef.name) : cardDef.name)
                : this.translationService.tOrFallback("common.unknownCard", "Unknown card");
            return this.translationService.tOrFallback("logs.player.explorationEvent", fallback, {
                ...baseParams,
                cardName,
            });
        }

        if (code === "player.discardResource" || code === "player.pendingPickupCancelled" || code === "player.resolvePendingPickup") {
            const key = code === "player.discardResource"
                ? "logs.player.discardResource"
                : code === "player.pendingPickupCancelled"
                    ? "logs.player.pendingPickupCancelled"
                    : "logs.player.resolvePendingPickup";
            return this.translationService.tOrFallback(key, fallback, {
                ...baseParams,
                resource: this.resolveResourceLabel(args["resource"]),
            });
        }

        if (code === "player.followerHostileEnvironmentDamage" || code === "player.followerRegeneratingWatersHealing") {
            const key = code === "player.followerHostileEnvironmentDamage"
                ? "logs.player.followerHostileEnvironmentDamage"
                : "logs.player.followerRegeneratingWatersHealing";
            return this.translationService.tOrFallback(key, fallback, {
                ...baseParams,
                followerName: this.resolveFollowerName(args),
            });
        }

        if (code === "player.swapResource") {
            return this.translationService.tOrFallback("logs.player.swapResource", fallback, {
                ...baseParams,
                droppedResource: this.resolveResourceLabel(args["droppedResource"]),
                gainedResource: this.resolveResourceLabel(args["gainedResource"]),
            });
        }

        if (code === "player.itemPickupRefused") {
            return this.translationService.tOrFallback("logs.player.itemPickupRefused", fallback, {
                ...baseParams,
                itemName: this.resolveItemName(args),
            });
        }

        if (code === "player.itemSwapped") {
            const discardedItemId = String(args["discardedItemId"] ?? "").trim();
            const discardedItem = discardedItemId ? this.itemCatalogService.getCachedItemById(discardedItemId) : null;
            const discardedItemName = discardedItem
                ? this.itemCatalogService.getLocalizedName(discardedItem)
                : this.translationService.tOrFallback("common.unknownItem", "Unknown item");
            return this.translationService.tOrFallback("logs.player.itemSwapped", fallback, {
                ...baseParams,
                itemName: this.resolveItemName(args),
                discardedItemName,
            });
        }

        if (code === "player.templeSendDevotee") {
            const source = this.getLocalizedActionLabel("temple-send-devotee", "Temple");
            return this.translationService.tOrFallback("logs.player.templeSendDevotee", fallback, {
                ...baseParams,
                source,
                gainedExperience: Math.max(0, Math.floor(Number(args["gainedExperience"] ?? 0))),
            });
        }

        if (code === "player.altarSacrifice") {
            const source = this.getLocalizedActionLabel("altar-sacrifice", "Altar");
            return this.translationService.tOrFallback("logs.player.altarSacrifice", fallback, {
                ...baseParams,
                source,
                gainedExperience: Math.max(0, Math.floor(Number(args["gainedExperience"] ?? 0))),
            });
        }

        if (code === "player.elementalRitual") {
            const source = this.getLocalizedActionLabel("elemental-ritual", "Altar");
            return this.translationService.tOrFallback("logs.player.elementalRitual", fallback, {
                ...baseParams,
                source,
                followerId: String(args["followerId"] ?? "follower"),
            });
        }

        if (code === "player.combatResult") {
            const enemy = String(args["enemy"] ?? "unknown enemy");
            const outcome = String(args["outcome"] ?? "");
            const damage = Number(args["damage"] ?? 0);
            const xp = Number(args["xp"] ?? 0);
            const key = outcome === "player-win"
                ? "logs.player.combatResult.win"
                : outcome === "player-loss"
                    ? "logs.player.combatResult.loss"
                    : outcome === "flee-lucky"
                        ? "logs.player.combatResult.fleeLucky"
                        : "logs.player.combatResult.flee";
            return this.translationService.tOrFallback(key, fallback, { ...baseParams, enemy, damage, xp });
        }

        if (code === "player.followerDismissed") {
            return this.translationService.tOrFallback("logs.player.followerDismissed", fallback, {
                ...baseParams,
                followerId: this.resolveFollowerName(args),
            });
        }

        if (code === "player.alchimistaHeal" || code === "player.alchimistaMana" || code === "player.hireMercenary") {
            const key = `logs.player.${code.split(".")[1]}`;
            return this.translationService.tOrFallback(key, fallback, baseParams);
        }

        if (code === "player.strangerHealPercent") {
            return this.translationService.tOrFallback("logs.player.strangerHealPercent", fallback, {
                ...baseParams,
                healedHp: Number(args["healedHp"] ?? 0),
            });
        }

        if (code === "player.strangerEnchantress") {
            return this.translationService.tOrFallback("logs.player.strangerEnchantress", fallback, {
                ...baseParams,
                rewardLabel: String(args["rewardLabel"] ?? ""),
            });
        }

        if (code === "player.strangerWishCoins" || code === "player.strangerWishXp") {
            const key = `logs.player.${code.split(".")[1]}`;
            return this.translationService.tOrFallback(key, fallback, {
                ...baseParams,
                amount: Number(args["amount"] ?? 0),
            });
        }

        if (code === "player.strangerWishStat") {
            return this.translationService.tOrFallback("logs.player.strangerWishStat", fallback, {
                ...baseParams,
                stat: this.resolveStatLabel(args["stat"]),
            });
        }

        if (code === "player.strangerWishTeleport") {
            return this.translationService.tOrFallback("logs.player.strangerWishTeleport", fallback, {
                ...baseParams,
                targetX: Number(args["targetX"] ?? 0),
                targetY: Number(args["targetY"] ?? 0),
            });
        }

        if (code === "player.strangerHermitMoved" || code === "player.strangerHermitAmulet") {
            const key = `logs.player.${code.split(".")[1]}`;
            return this.translationService.tOrFallback(key, fallback, baseParams);
        }

        if (code === "player.strangerSpellTeacher") {
            const spellName = this.resolveSpellName(args);
            return this.translationService.tOrFallback("logs.player.strangerSpellTeacher", fallback, {
                ...baseParams,
                spellName,
                source: String(args["source"] ?? ""),
            });
        }

        if (code === "player.strangerSpellTeacherFull" || code === "player.strangerSpellTeacherEmpty") {
            const key = `logs.player.${code.split(".")[1]}`;
            return this.translationService.tOrFallback(key, fallback, baseParams);
        }

        if (code === "player.placeFountainDamage") {
            return this.translationService.tOrFallback("logs.player.placeFountainDamage", fallback, {
                ...baseParams,
                damage: Number(args["damage"] ?? 0),
                usesLeft: Number(args["usesLeft"] ?? 0),
                placeName: String(args["placeName"] ?? ""),
            });
        }
        if (code === "player.placeFountainStatBoost") {
            return this.translationService.tOrFallback("logs.player.placeFountainStatBoost", fallback, {
                ...baseParams,
                amount: Number(args["amount"] ?? 0),
                stat: this.resolveStatLabel(args["stat"]),
                usesLeft: Number(args["usesLeft"] ?? 0),
                placeName: String(args["placeName"] ?? ""),
            });
        }
        if (code === "player.placeFountainHpBoost") {
            return this.translationService.tOrFallback("logs.player.placeFountainHpBoost", fallback, {
                ...baseParams,
                usesLeft: Number(args["usesLeft"] ?? 0),
                placeName: String(args["placeName"] ?? ""),
            });
        }
        if (code === "player.placeFountainExhausted") {
            return this.translationService.tOrFallback("logs.player.placeFountainExhausted", fallback, {
                placeName: String(args["placeName"] ?? ""),
            });
        }
        if (code === "player.placePortal") {
            return this.translationService.tOrFallback("logs.player.placePortal", fallback, {
                ...baseParams,
                destination: String(args["destination"] ?? ""),
            });
        }
        if (code === "player.placeCaveDamage") {
            return this.translationService.tOrFallback("logs.player.placeCaveDamage", fallback, {
                ...baseParams,
                damage: Number(args["damage"] ?? 0),
            });
        }
        if (code === "player.placeCaveCoins") {
            return this.translationService.tOrFallback("logs.player.placeCaveCoins", fallback, {
                ...baseParams,
                amount: Number(args["amount"] ?? 0),
            });
        }
        if (code === "player.placeChapelHeal") {
            return this.translationService.tOrFallback("logs.player.placeChapelHeal", fallback, {
                ...baseParams,
                healedHp: Number(args["healedHp"] ?? 0),
            });
        }
        if (code === "player.placeChapelSpell") {
            const spellName = this.resolveSpellName(args);
            return this.translationService.tOrFallback("logs.player.placeChapelSpell", fallback, {
                ...baseParams,
                spellName,
            });
        }
        if (code === "player.placeChapelActivatedTeleport") {
            return this.translationService.tOrFallback("logs.player.placeChapelActivatedTeleport", fallback, {
                ...baseParams,
                targetX: Number(args["targetX"] ?? 0),
                targetY: Number(args["targetY"] ?? 0),
            });
        }

        const genericKey = `logs.${code}`;
        return this.translationService.tOrFallback(genericKey, fallback, baseParams);
    }

    private buildFallbackMessage(code: string, playerName: string, args: Record<string, unknown>): string {
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

    private getLocalizedActionLabel(actionId: string, fallbackLabel: string): string {
        return this.actionCatalogService.getLabel(actionId, fallbackLabel);
    }

    private stringifyArgs(args: Record<string, unknown>): Record<string, string | number> {
        const next: Record<string, string | number> = {};
        Object.entries(args).forEach(([key, value]) => {
            if (typeof value === "string" || typeof value === "number") {
                next[key] = value;
                return;
            }

            if (typeof value === "boolean") {
                next[key] = value ? 1 : 0;
            }
        });
        return next;
    }

    private resolveBiomeLabel(args: Record<string, unknown>): string {
        const biome = typeof args["biome"] === "string" ? String(args["biome"]) : "";
        if (biome) {
            return this.translationService.tOrFallback(`map.biomes.${biome}`, biome);
        }

        return String(args["biomeLabel"] ?? "a biome");
    }

    private resolveSanctuaryLabel(args: Record<string, unknown>): string {
        const sanctuary = typeof args["sanctuary"] === "string" ? String(args["sanctuary"]) : "";
        if (sanctuary) {
            return this.translationService.tOrFallback(`map.cells.sanctuary.${sanctuary}`, sanctuary);
        }

        return String(args["sanctuaryLabel"] ?? "a sanctuary");
    }

    private resolveLandmarkLabel(args: Record<string, unknown>): string {
        const landmarkId = typeof args["landmarkId"] === "string" ? String(args["landmarkId"]) : "";
        if (landmarkId) {
            const fallback = this.translationService.tOrFallback("map.cells.unknownLandmark", "Unknown Landmark");
            return this.translationService.tOrFallback(`map.landmarks.names.${landmarkId}`, fallback);
        }

        return String(args["landmarkName"] ?? "a landmark");
    }

    private resolveResourceLabel(value: unknown): string {
        const resource = String(value ?? "").trim();
        if (!resource) return "resource";
        if (resource === "timber" || resource === "food" || resource === "minerals" || resource === "cloth") {
            return this.translationService.tOrFallback(`resources.${resource}`, resource);
        }

        return resource;
    }

    private resolveAlignmentLabel(value: string): string {
        const normalized = value.toLowerCase();
        if (normalized === "good" || normalized === "neutral" || normalized === "evil") {
            return this.translationService.tOrFallback(`lobby.alignment.${normalized}`, normalized);
        }

        return value;
    }

    private resolveWorldEventOutcomeLabel(value: unknown): string {
        const normalized = String(value ?? "").toLowerCase().trim();
        if (normalized === "negative" || normalized === "positive" || normalized === "none") {
            return this.translationService.tOrFallback(`map.worldPanel.worldEventOutcome.${normalized}`, normalized);
        }

        return String(value ?? "-");
    }

    private resolveWorldEventTitleLabel(value: unknown): string {
        const normalized = String(value ?? "").trim();
        if (!normalized) {
            return this.translationService.tOrFallback("map.worldEventTitle.default", "World Event");
        }

        return this.translationService.tOrFallback(normalized, normalized);
    }

    private normalizeTemplateParams(value: unknown): Record<string, string | number> {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return {};
        }

        const source = value as Record<string, unknown>;
        const next: Record<string, string | number> = {};
        Object.entries(source).forEach(([key, entry]) => {
            if (typeof entry === "string" || typeof entry === "number") {
                next[key] = entry;
            }
        });

        return next;
    }

    private enrichSystemInfoParams(
        textKey: string,
        params: Record<string, string | number>,
    ): Record<string, string | number> {
        if (!textKey) {
            return params;
        }

        const next = { ...params };

        if (textKey === "logs.system.itemPreventedCondition" || textKey === "logs.system.itemRechargedInBiome") {
            const itemId = String(params["itemId"] ?? "").trim();
            if (itemId) {
                const item = this.itemCatalogService.getCachedItemById(itemId);
                next["itemName"] = item ? this.itemCatalogService.getLocalizedName(item) : this.translationService.tOrFallback("common.unknownItem", "Unknown item");
            }
        }

        if (textKey === "logs.system.itemRechargedInBiome") {
            const biome = String(params["biome"] ?? "").trim();
            if (biome) {
                next["biomeLabel"] = this.translationService.tOrFallback(`map.biomes.${biome}`, biome);
            }
        }

        return next;
    }

    private resolveItemName(args: Record<string, unknown>): string {
        const itemId = String(args["itemId"] ?? "").trim();
        if (itemId) {
            const item = this.itemCatalogService.getCachedItemById(itemId);
            if (item) {
                return this.itemCatalogService.getLocalizedName(item);
            }
        }

        return String(args["itemName"] ?? "") || this.translationService.tOrFallback("common.unknownItem", "Unknown item");
    }

    private resolveFollowerName(args: Record<string, unknown>): string {
        const followerId = String(args["followerId"] ?? "").trim();
        if (followerId) {
            const follower = this.followerCatalogService.getCachedFollowerById(followerId);
            if (follower) {
                return this.followerCatalogService.getLocalizedName(follower);
            }
        }

        return String(args["followerName"] ?? "") || this.translationService.tOrFallback("common.unknownFollower", "Unknown follower");
    }

    private resolveStatLabel(value: unknown): string {
        const stat = String(value ?? "").trim();
        if (stat === "strength") return this.translationService.tOrFallback("stats.strengthAbbr", "STR");
        if (stat === "magic") return this.translationService.tOrFallback("stats.magicAbbr", "MAG");
        if (stat === "mp") return this.translationService.tOrFallback("stats.mpAbbr", "MP");
        return stat;
    }

    private resolveSpellName(args: Record<string, unknown>): string {
        const spellId = String(args["spellId"] ?? "").trim();
        if (spellId) {
            const spell = this.spellCatalogService.getSpell(spellId);
            if (spell) return this.spellCatalogService.getLocalizedName(spell);
        }
        return String(args["spellName"] ?? "") || this.translationService.tOrFallback("common.unknownSpell", "Unknown spell");
    }
}
