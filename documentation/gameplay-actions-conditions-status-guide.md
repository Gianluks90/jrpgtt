# Guida pratica: azioni, conditions e status

Questa guida descrive passo passo come estendere il gameplay nel progetto, con esempi reali e pattern riutilizzabili.

Obiettivi:
- creare azioni di ogni genere;
- creare conditions legate alla cella o al bioma;
- creare status legati al player;
- combinare fortuna, parametri esterni, dialog e scrittura log.

---

## 1) Panorama dell'architettura attuale

Flusso standard di una azione:
1. Config: definiamo action id e condition nei file json.
2. Model + Validator: estendiamo i tipi e la validazione.
3. UI Registry: creiamo card, label, description e disabled logic.
4. Map Page: dispatch dell'action id verso executor o dialog.
5. Executor transazionale: controlli autoritativi, update Firestore, eventuale fine turno.
6. Event log: messaggio leggibile in timeline.

File principali coinvolti:
- public/configs/tiles.config.json
- src/app/models/TilesConfig.ts
- src/app/services/tiles-config-service.ts
- src/app/services/action-registry-service.ts
- src/app/pages/map-page/map-page.ts
- src/app/services/action-executor-service.ts
- src/app/models/EventLog.ts
- src/app/services/event-log-service.ts

---

## 2) Come creare una nuova azione

### Passo A - Definire l'action id in configurazione

Aggiungi l'id nella sezione corretta:
- bioma: biomes.<nome>.actions
- sanctuary: specialTiles.sanctuaries.<element>.actions.active/inactive

Esempio bioma:
```json
    {
      "biomes": {
        "forest": {
          "label": "Foresta",
          "walkable": true,
          "resources": ["timber"],
          "actions": ["cell-gather", "inspect-tracks"],
          "conditions": []
        }
      }
    }
```

### Passo B - Mappare la card nel registry UI

In ActionRegistryService, aggiungi il ramo per actionId.

Esempio:

```typescript
    if (actionId === "inspect-tracks") {
      return {
        id: "inspect-tracks",
        label: "Inspect tracks",
        description: "Reveal hints about nearby danger.",
        disabled: !isMyTurn || !hasMovedThisTurn || isBusy || actionAlreadyUsed,
        pending: false,
      };
    }
```

Consigli pratici:
- usa sempre disabled difensivo lato UI;
- mantieni coerente la regola hasMovedThisTurn se l'azione dipende dalla casella di arrivo;
- usa actionAlreadyUsed per anti spam per turno.

### Passo C - Dispatch in map page

In MapPage, intercetta l'action id:

```typescript
    if (actionId === "inspect-tracks") {
      await this.onInspectTracksRequested();
      return;
    }
```

E crea il metodo handler:

```typescript
    private async onInspectTracksRequested(): Promise<void> {
      const player = this.myPlayer();
      if (!player || !this.isMyTurn()) return;

      this.pendingActionId.set("inspect-tracks");
      try {
        await this.actionExecutorService.inspectTracks(this.gameId, {
          id: player.id,
          name: player.name,
        });
      } finally {
        this.pendingActionId.set(null);
      }
    }
```

### Passo D - Implementare l'azione in executor

In ActionExecutorService:
- verifica world state e ownership turno;
- verifica che il player abbia mosso nel turno (se necessario);
- verifica anti spam;
- carica cella corrente e validala;
- applica update con transaction.set;
- scrivi log.

Schema base:

```typescript
    public async inspectTracks(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
      const worldStateRef = doc(this.firebaseService.database, "games", gameId, "runtime", "worldState");
      const playerRef = doc(this.firebaseService.database, "games", gameId, "players", actor.id);

      await runTransaction(this.firebaseService.database, async (transaction) => {
        const [worldStateSnap, playerSnap] = await Promise.all([
          transaction.get(worldStateRef),
          transaction.get(playerRef),
        ]);

        const worldState = worldStateSnap.data() as WorldState;
        const player = playerSnap.data() as Player;
        const worldTurn = worldState.currentTurn ?? 0;

        this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using cell actions");
        this.ensureActionAvailable(player, "inspect-tracks", worldTurn, "You can only inspect once per turn.");

        transaction.set(playerRef, {
          actionsUsedThisTurn: this.markActionUsed(player, "inspect-tracks", worldTurn),
        }, { merge: true });
      });

      await this.tryCreateLog(gameId, actor, "player.inspectTracks", {});
    }
```

### Passo E - Event log tipizzato e formatter

In EventLog.ts, aggiungi il codice:

```typescript
    | "player.inspectTracks"
```

In EventLogService, formatter:

```typescript
    "player.inspectTracks": ({ playerName }) => {
      return `${playerName} inspected tracks in the area.`;
    },
```
---

## 3) Esempio completo: azione con controllo fortuna

Caso reale già usato nel progetto: pray sanctuary.
Pattern:
1. leggi luck del player;
2. calcola luckResult prima della transaction;
3. applica effetto in transaction;
4. salva lastLuckCheck;
5. logga lucky o non lucky.

Template riutilizzabile:

```typescript
    const playerLuck = Math.max(0, Math.floor(Number(player.parameters?.luck?.current ?? 0)));
    const luckResult = this.luckService.checkLuck(playerLuck);

    const effectPower = luckResult.success ? strongValue : baseValue;

    transaction.set(playerRef, {
      lastLuckCheck: luckResult,
      ...otherUpdates,
    }, { merge: true });
```
---

## 4) Esempio completo: azione con costo e fine turno

Caso reale: cell-gather.
Regole correnti:
- funziona solo dopo movimento del turno;
- successo solo su luck;
- se usata, termina subito il turno.

Pattern chiave:

```typescript
    this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before gathering");
    this.ensureActionAvailable(player, "cell-gather", worldTurn, "You can only gather once per turn.");

    if (luckResult.success) {
      gatheredResource = this.pickRandom(biomeConfig.resources);
      nextResources = this.addResource(nextResources, gatheredResource, 1);
    }

    const nextWorldState: WorldState = { ...worldState };
    this.turnService.advanceTurn(nextWorldState);
    transaction.set(worldStateRef, nextWorldState);
```
---

## 5) Azioni con parametri esterni

Ci sono due varianti utili.

### Variante 1 - Parametri da dialog (già usata)

Esempio già presente: sanctuary activate/donate con dialog di conferma.
Flusso:
1. apri dialog in MapPage;
2. ricevi response;
3. se conferma, chiama executor.

Pattern:

```typescript
    const confirmed = await this.openSanctuaryActionDialog({
      mode: "donate",
      sanctuaryElement: cell.sanctuaryElement,
      playerMoney: player.inventory?.money ?? 0,
    });
    if (!confirmed) return;

    await this.actionExecutorService.donateAtSanctuary(this.gameId, {
      id: player.id,
      name: player.name,
    });
```

### Variante 2 - Parametri da config

Se vuoi azioni più data-driven, puoi aggiungere campi opzionali in config, per esempio:

```json
    "actionsConfig": {
      "inspect-tracks": {
        "xp": 1,
        "luckBonus": 0.1,
        "cooldownTurns": 1
      }
    }
```

Poi in executor leggi i parametri e applica fallback sicuri.

---

## 6) Come creare una condition per cella/bioma

Nel progetto la condition vive nella definizione bioma: biomes.<nome>.conditions.

### Passo A - Aggiungere condition nel config

Esempio attuale deserto:

```json
    "desert": {
      "label": "Deserto",
      "walkable": true,
      "resources": [],
      "actions": ["consume-ration"],
      "conditions": ["hostile-environment"]
    }
```

### Passo B - Aggiornare tipi e validator

Già presente nel progetto:
- TilesConfig.ts contiene conditions: string[]
- TilesConfigService valida che sia array di stringhe non vuote

Se aggiungi nuove condizioni, mantieni naming stabile.
Consiglio: usa id espliciti, per esempio:
- hostile-environment
- slippery-ground
- cursed-zone

### Passo C - Applicare la condition nel momento giusto

Esempio reale: hostile-environment applicata in endTurn.
Pattern:

```typescript
    const biomeConfig = tilesConfig.biomes[currentCell.biome];
    const isHostileEnvironment = (biomeConfig?.conditions ?? []).includes("hostile-environment");

    if (isHostileEnvironment && !hasNutrition) {
      // applica danno
    }
```

Suggerimento design:
- metti effects passivi in endTurn o move;
- metti checks di accesso azione nel registry + executor.

---

## 7) Come creare uno status player

### Passo A - Modellazione

In Player.ts c'è già:
- tipo PlayerStatus
- campo statuses?: PlayerStatus[]

Campi chiave:
- key
- label
- description
- durationTurns
- effectKey opzionale

### Passo B - Normalizzazione e lifecycle

Pattern già presente in ActionExecutorService:
- normalizeStatuses: filtra valori invalidi
- decrementStatuses: scala duration e rimuove scaduti
- hasStatus: utility lookup
- upsertStatus: refresh o inserimento

### Passo C - Applicazione status da azione

Esempio reale consume-ration:

```typescript
    const nextStatuses = this.upsertStatus(this.normalizeStatuses(player.statuses), {
      key: "nutrition",
      label: "Nutrition",
      description: "Prevents hostile desert damage for this turn.",
      durationTurns: 1,
    });
```

### Passo D - Consumo status nel motore

Esempio reale endTurn:

    const currentStatuses = this.normalizeStatuses(player.statuses);
    const hasNutrition = this.hasStatus(currentStatuses, "nutrition");
    const nextStatuses = this.decrementStatuses(currentStatuses);

```typescript
    if (isHostileEnvironment && !hasNutrition) {
      // danno
    }
``

---

## 8) Combinazioni utili già supportate

### A) Fortuna + costo + log dettagliato
- genera luckResult;
- applica costo se necessario;
- logga lucky true/false;
- aggiorna lastLuckCheck.

### B) Dialog + transazione autoritativa
- il dialog decide solo intent;
- la validazione reale rimane in transaction.

### C) Action con chiusura turno
- esegui effetto;
- aggiorna eventuali status;
- advanceTurn;
- scrivi log di azione.

### D) Condition + status di protezione
- condition attiva effetto negativo;
- status specifico annulla o riduce l'effetto.

---

## 9) Checklist rapida prima di chiudere una feature

1. Config aggiornata (action ids / conditions).
2. Tipi e validator aggiornati.
3. Action registry aggiornato con disabled logic.
4. Map page aggiornata con dispatch e pending.
5. Executor con transaction e guardie server-side.
6. Event log code + formatter.
7. Regole anti spam per turno.
8. Build locale senza errori.

---

## 10) Mini ricetta per una nuova feature

Esempio: cursed-zone.
- Config: aggiungi condition cursed-zone ai biomi scelti.
- Status: aggiungi status ward per annullare curse.
- Azione: aggiungi bless-ward in shrine, con costo mana o money.
- End turn: se cursed-zone e senza ward, applica debuff.
- UI: card disabilitata se non hai requisito.
- Log: player.applyWard, player.curseDamage.

Con questo schema mantieni il progetto coerente, estendibile e sicuro lato transazione.