# Actions System Guide

Guida pratica e completa per creare nuove action nel gioco.

Questa documentazione è basata sull’architettura reale del progetto.

---

# Filosofia del sistema

Le action sono divise in 4 layer distinti:

| Layer | Responsabilità |
|---|---|
| Config JSON | definisce dove l’action esiste |
| Action Registry | costruisce la UI |
| Map Page | dispatcha il click |
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
Action Registry
↓
Map Page
↓
Action Executor
↓
Firestore Transaction
↓
Event Log
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
| `action-registry-service.ts` | card UI |
| `map-page.ts` | dispatch action |
| `action-executor-service.ts` | gameplay reale |
| `event-log-service.ts` | formatter log |
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

# STEP 2 — Action Registry

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

# STEP 3 — Map Page Dispatch

Dentro la map page:

```ts
if (actionId === "drink-water") {
  await this.onDrinkWater();
  return;
}
```

---

# Handler standard

```ts
private async onDrinkWater(): Promise<void> {

  const player = this.myPlayer();

  if (!player || !this.isMyTurn()) {
    return;
  }

  this.pendingActionId.set("drink-water");

  try {

    await this.actionExecutorService.drinkWater(
      this.gameId,
      {
        id: player.id,
        name: player.name,
      },
    );

  } finally {

    this.pendingActionId.set(null);

  }
}
```

---

# pendingActionId

Serve per:
- spinner;
- loading state;
- anti double click;
- UX.

---

# STEP 4 — Executor

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
"player.drinkWater": ({ playerName, healedHp }) => {
  return `${playerName} drank fresh water and recovered ${healedHp} HP.`;
},
```

---

# Checklist completa nuova action

- [ ] Action aggiunta nel config JSON
- [ ] Registry UI creato
- [ ] Dispatch aggiunto nella map page
- [ ] Handler creato
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
| Turn-ending action | gather |
| Attunement swap | donate-sanctuary |

---

# Best Practices

---

# 1. Mai fidarsi della UI

Tutti i controlli veri devono stare nell’executor.

---

# 2. Non mettere gameplay nella MapPage

La map page deve solo dispatchare.

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