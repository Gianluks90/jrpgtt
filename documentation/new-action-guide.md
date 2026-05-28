# Actions System Guide

Guida pratica e completa per creare nuove action nel gioco.

Questa documentazione è basata sull’architettura reale del progetto.

---

# Filosofia del sistema

Le action sono divise in 6 layer distinti (architettura attuale):

| Layer | Responsabilità |
|---|---|
| Config JSON | definisce dove l’action esiste |
| MapPageStateService | carica tiles config e stato utile alla map |
| MapPageActionsService | risolve gli actionId disponibili nella cella corrente |
| Action Registry | costruisce le card UI |
| MapPageInteractionService | dispatcha il click e gestisce pending/dialog |
| Action Executor | gameplay reale e update Firestore |

IMPORTANTE:

La UI NON è autoritativa.

Tutti i controlli reali devono vivere dentro `ActionExecutorService`.

---

# Flusso completo di una action

Quando un player usa una action:

```txt
Config JSON
↓
MapPageStateService (load config)
↓
MapPageActionsService (resolve action ids)
↓
ActionRegistryService (build cards)
↓
MapPageInteractionService (dispatch)
↓
ActionExecutorService
↓
Firestore Transaction
↓
EventLogService
```

---

# Architettura mentale corretta

Una action dovrebbe sempre seguire questo schema:

```txt
VALIDATE
↓
COMPUTE
↓
APPLY
↓
LOG
```

---

# VALIDATE

Controlli:
- turno corretto;
- player valido;
- movement requirement;
- action anti spam;
- biome corretto;
- risorse sufficienti;
- status richiesti.

---

# COMPUTE

Calcoli:
- heal;
- damage;
- luck;
- reward;
- status;
- resource changes.

IMPORTANTE:
Non modificare Firestore qui.

---

# APPLY

Qui avvengono i veri update:
- player;
- worldState;
- mapCell;
- inventory;
- statuses.

Sempre dentro transaction.

---

# LOG

I log vengono creati fuori dalla transaction tramite:

```ts
await this.tryCreateLog(...)
```

---

# File principali coinvolti

| File | Ruolo |
|---|---|
| `tiles.config.json` | definizione actions/conditions |
| `map-page-state-service.ts` | carica config e mapping usati dalla map |
| `map-page-actions-service.ts` | compone command action da cella + config |
| `action-registry-service.ts` | card UI |
| `map-page-interaction-service.ts` | dispatch action e gestione pendingActionId |
| `map-page.ts` | wiring tra signals/eventi e servizi |
| `action-executor-service.ts` | gameplay reale |
| `event-log-service.ts` | formatter + scrittura log |
| `EventLog.ts` | tipi log |

---

# Creare una nuova action

---

# STEP 1 — Config JSON

Aggiungere la action nel biome o special tile.

Esempio:

```json
"water": {
  "actions": [
    "drink-water"
  ]
}
```

Questo NON contiene logica.

Dice solo:
> questa action esiste qui.

---

# STEP 2 — Risoluzione action (config-driven)

File principali:

```txt
map-page-actions-service.ts
action-registry-service.ts
```

Pipeline UI attuale:

1) `MapPageActionsService.buildCommandActions()` risolve gli `actionId` disponibili dalla cella corrente (biome/special tile) usando `tiles.config.json`.

2) Per ogni `actionId`, chiama `ActionRegistryService.buildActionCard(...)`.

3) La lista risultante viene renderizzata dal command panel.

---

# STEP 3 — Action Registry

File:

```txt
action-registry-service.ts
```

Metodo:

```ts
buildActionCard()
```

Qui si crea la card UI.

Esempio:

```ts
if (actionId === "drink-water") {

  const hpCurrent = Math.max(
    0,
    Math.floor(Number(player.parameters.hp.current)),
  );

  const hpMax = Math.max(
    1,
    Math.floor(Number(
      typeof player.parameters.hp.max === "number"
        ? player.parameters.hp.max
        : player.parameters.hp.base,
    )),
  );

  return {
    id: "drink-water",
    label: "Drink water",
    description: "Recover 1% HP.",
    disabled:
      !isMyTurn ||
      !hasMovedThisTurn ||
      isBusy ||
      hpCurrent >= hpMax ||
      actionAlreadyUsed,
    pending: false,
  };
}
```

---

# Regole importanti del registry

Il registry:
- NON deve modificare gameplay;
- NON deve aggiornare Firestore;
- NON deve essere trusted.

Serve solo per:
- UX;
- label;
- description;
- disabled logic;
- evitare click inutili.

---

# STEP 4 — Dispatch (Interaction Service)

La map page non fa più dispatch con `if/switch` per ogni action.

La map page delega a `MapPageInteractionService`:

```ts
public async onCommandActionRequested(actionId: string): Promise<void> {
  await this.mapPageInteractionService.handleCommandAction({
    actionId,
    gameId: this.gameId,
    myPlayer: this.myPlayer(),
    isMyTurn: this.isMyTurn(),
    canEndTurn: this.canEndTurn(),
    mapCellsById: this.mapCellsById(),
  });
}
```

---

# Handler standard (dentro map-page-interaction-service.ts)

```ts
"drink-water": async () => {
  if (!input.myPlayer || !input.isMyTurn) return;

  await this.runNamedAction("drink-water", async () => {
    await this.actionExecutorService.drinkWater(input.gameId, {
      id: input.myPlayer.id,
      name: input.myPlayer.name,
    });
  }, "Error while drinking water");
},
```

---

# pendingActionId

`pendingActionId` vive in `MapPageInteractionService` e serve per:
- spinner;
- loading state;
- anti double click;
- UX.

---

# STEP 5 — Executor

File:

```txt
action-executor-service.ts
```

Qui vive il gameplay reale.

---

# Template standard executor

```ts
public async myAction(
  gameId: string,
  actor: Pick<Player, "id" | "name">,
): Promise<void> {

  if (!gameId || !actor.id) {
    throw new Error("Invalid action payload");
  }

  const worldStateRef = doc(...);
  const playerRef = doc(...);
  const gameRef = doc(...);

  await runTransaction(this.firebaseService.database, async (transaction) => {

    // LOAD DATA

    // VALIDATE

    // COMPUTE

    // APPLY

  });

  // LOG
}
```

---

# Validazioni standard

Quasi tutte le action usano queste.

---

## Turn ownership

```ts
if (
  worldState.activePlayerId &&
  worldState.activePlayerId !== actor.id
) {
  throw new Error("It is not your turn");
}
```

---

## Movement requirement

```ts
this.ensurePlayerMovedThisTurn(
  worldState,
  actor.id,
  "You must move before using cell actions",
);
```

---

## Anti spam per turno

```ts
this.ensureActionAvailable(
  player,
  "drink-water",
  worldTurn,
  "You can only use this action once per turn.",
);
```

---

# Accesso cella corrente

Pattern standard:

```ts
const mapCellRef = doc(
  this.firebaseService.database,
  "games",
  gameId,
  "mapCells",
  this.cellId(player.location.x, player.location.y),
);

const mapCellSnap = await transaction.get(mapCellRef);
```

---

# Validazione biome

```ts
if (mapCell.isSpecial === true) {
  throw new Error("Invalid biome action");
}

const biomeConfig = tilesConfig.biomes[mapCell.biome];

if (!(biomeConfig.actions ?? []).includes("drink-water")) {
  throw new Error("Action not available here");
}
```

---

# Status System

I player status vivono dentro:

```ts
player.statuses
```

Formato:

```ts
{
  key: "nutrition",
  label: "Nutrition",
  description: "...",
  durationTurns: 1,
}
```

---

# Utility status disponibili

---

## normalizeStatuses

Pulisce dati invalidi.

```ts
this.normalizeStatuses(player.statuses)
```

---

## hasStatus

```ts
this.hasStatus(statuses, "nutrition")
```

---

## decrementStatuses

Riduce durata turni.

```ts
this.decrementStatuses(statuses)
```

---

## upsertStatus

Refresh o inserimento status.

```ts
this.upsertStatus(statuses, nextStatus)
```

---

# Conditions

Le conditions appartengono ai biome.

Esempio:

```json
"conditions": [
  "hostile-environment"
]
```

---

# Pattern corretto

Il mondo applica pressione.

Il player usa status per reagire.

Esempio:

```txt
Biome condition:
freezing

Player status:
warmth
```

Logica:

```ts
if (isFreezing && !hasWarmth) {
  damagePlayer();
}
```

---

# Resource Helpers

---

## addResource

Aggiunge o rimuove risorse.

```ts
this.addResource(resources, "food", -1)
```

---

## pickRandom

```ts
this.pickRandom(values)
```

---

# Fine turno

Action che consumano il turno:

```ts
const nextWorldState: WorldState = {
  ...worldState,
};

this.turnService.advanceTurn(nextWorldState);

transaction.set(worldStateRef, nextWorldState);
```

---

# Event Log

---

# STEP 1 — EventLog.ts

Aggiungere tipo:

```ts
| "player.drinkWater"
```

---

# STEP 2 — EventLogService

Formatter:

```ts
"player.drinkWater": ({ playerName, args }) => {
  const healedHp = Number(args["healedHp"] ?? 0);
  return `${playerName} drank fresh water and recovered ${healedHp} HP.`;
},
```

---

# Checklist completa nuova action

- [ ] Action aggiunta nel config JSON
- [ ] Action risolta in `MapPageActionsService` (config-driven)
- [ ] Registry UI creato
- [ ] Handler creato in `MapPageInteractionService`
- [ ] Metodo executor implementato
- [ ] Validazioni aggiunte
- [ ] Update Firestore implementati
- [ ] Event log aggiunto
- [ ] Action anti spam implementata
- [ ] Testata in game

---

# Pattern gameplay già presenti nel progetto

| Pattern | Esempio |
|---|---|
| Heal | pray-sanctuary |
| Resource exchange | cell-gather |
| Protection status | consume-ration |
| Environment damage | hostile-environment |
| Turn-ending action | cell-gather |
| Attunement swap | donate-sanctuary |

---

# Best Practices

---

# 1. Mai fidarsi della UI

Tutti i controlli veri devono stare nell’executor.

---

# 2. Non mettere gameplay nei layer UI

`map-page.ts` orchestra e delega, `map-page-interaction-service.ts` dispatcha.
Il gameplay resta in `ActionExecutorService`.

---

# 3. Le transaction sono autoritative

Tutte le modifiche gameplay devono stare dentro:

```ts
runTransaction(...)
```

---

# 4. Il registry è solo UX

Il registry non è sicurezza.

---

# 5. Mantieni naming coerente

Usa id chiari:

```txt
drink-water
consume-ration
pray-sanctuary
```

---

# 6. Le condition descrivono il mondo

NON il player.

---

# 7. Gli status descrivono il player

NON il biome.

---

# 8. Evita logica duplicata

Quando più action condividono regole:
- estrai helper;
- crea utility;
- centralizza validation.

---

# Evoluzioni future consigliate

Il progetto crescerà meglio con:

- action definitions centralizzate;
- effect system;
- generic condition processor;
- generic resource cost system;
- generic reward system.

Ma la struttura attuale è già solida e scalabile.

---

# Checklist rapida (uso quotidiano)

- [ ] Aggiungi action id in `tiles.config.json` (biome o special tile)
- [ ] Verifica che l’action venga risolta da `MapPageActionsService`
- [ ] Aggiungi/aggiorna card in `ActionRegistryService`
- [ ] Registra handler in `MapPageInteractionService` con `runNamedAction`
- [ ] Implementa metodo in `ActionExecutorService` (`VALIDATE -> COMPUTE -> APPLY -> LOG`)
- [ ] Aggiungi `EventLogCode` in `EventLog.ts` e formatter in `EventLogService` (usa `args`)
- [ ] Applica anti-spam turno (`ensureActionAvailable`) e movement requirement quando richiesto
- [ ] Decidi se l’action chiude il turno (`turnService.advanceTurn`) o no
- [ ] Testa in game: happy path + error path principali