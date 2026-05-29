# Action Catalog Guide (for everyone)

Questa guida spiega come aggiungere una nuova action nel progetto anche se non conosci ancora il flusso interno.

Obiettivo: aggiungere una action senza rompere UI, gameplay e log.

## 1. Mappa mentale del flusso

Quando clicchi una action nel pannello comandi, il flusso e questo:

1. `public/configs/actions.config.json`
2. `src/app/services/action-catalog-service.ts`
3. `src/app/services/map-page-actions-service.ts`
4. `src/app/services/action-registry-service.ts`
5. `src/app/services/map-page-interaction-service.ts`
6. `src/app/services/action-executor-service.ts`
7. `src/app/services/event-log-service.ts`

In breve:
- il catalogo definisce metadata e flow
- il registry costruisce la card UI
- interaction dispatcha il trigger
- executor applica la logica reale (autoritativa)
- event log formatta il messaggio finale

## 2. Dove si definisce una action

Una nuova action richiede sempre due definizioni:

1. Dove appare sulla mappa (placement):
- biome: `public/configs/tiles.config.json`
- safe landmark: `public/configs/landmarks.config.json`

2. Come si comporta (catalogo):
- `public/configs/actions.config.json`

Se il JSON esterno non e disponibile, il fallback e in:
- `src/app/consts/actions-catalog-default.ts`

## 3. Schema minimo di una action nel catalogo

Esempio reale semplificato:

```json
{
  "id": "capital-doctor",
  "ui": {
    "label": "Doctor",
    "descriptionTemplate": "Capital: restore 5% HP per treatment. Cost {costPerUnit} coins each ({timeOfDay}), then end turn.",
    "i18n": {
      "labelKey": "actions.capitalDoctor.label",
      "descriptionKey": "actions.capitalDoctor.description"
    }
  },
  "flow": {
    "handler": "safe-place-doctor",
    "errorMessage": "Error while using capital doctor",
    "trigger": "command-panel",
    "validators": ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
    "dialog": {
      "type": "doctor-heal"
    },
    "requiresMyTurn": true
  },
  "log": {
    "sourceLabel": "Capital Doctor"
  }
}
```

## 4. Trigger disponibili

Al momento esiste un trigger ufficiale:

- `command-panel`

Significa che la action puo essere eseguita dal pannello comandi mappa.

Validazione trigger:
- `MapPageInteractionService.handleCommandAction(...)` rifiuta trigger diversi.

## 5. Validators disponibili

I validator catalogati oggi sono comuni (UI gate):

- `my-turn`
- `moved-this-turn`
- `not-busy`
- `action-not-used`

Sono letti in:
- `ActionRegistryService.isCommonValidatorDisabled(...)`

Importante:
- questi validator migliorano UX e prevengono click inutili
- NON sostituiscono i controlli autoritativi dell executor

## 6. Dialog type disponibili

Nel catalogo, `flow.dialog.type` puo essere:

- `none`
- `sanctuary-action`
- `doctor-heal`
- `resource-exchange`

Dettaglio sanctuary:
- `sanctuaryMode`: `activate` o `donate`
- `requiredActive`: `true` o `false`

Risoluzione dialog runtime:
- `MapPageInteractionService.resolveSanctuaryFlowConfig(...)`

## 6.1 Warning config-driven (i18n-ready)

Per mostrare warning non bloccanti come "inventario pieno" usa il catalogo action, non stringhe hardcoded nel service.

Campi consigliati in `ui`:
- `warningTemplate`: testo warning con placeholder, per esempio `{requiredSlots}` e `{availableSlots}`
- `i18n.warningKey`: chiave futura per la traduzione

Esempio:

```json
"ui": {
  "label": "Gatherer",
  "descriptionTemplate": "Camp: gain 1 timber and 1 minerals, then end turn.",
  "warningTemplate": "Warning: camp reward needs {requiredSlots} free slots, available {availableSlots}.",
  "i18n": {
    "labelKey": "actions.campGatherer.label",
    "descriptionKey": "actions.campGatherer.description",
    "warningKey": "actions.campGatherer.warning.capacity"
  }
}
```

## 7. Checklist completa per aggiungere una nuova action

### Step 1 - Definisci placement (dove compare)

Se biome:
- aggiungi `"my-action-id"` in `tiles.config.json` dentro `biomes.<biome>.actions`

Se safe landmark:
- aggiungi `"my-action-id"` in `landmarks.config.json` dentro `safePlaceActionsByLandmark.<landmarkId>`

### Step 2 - Definisci metadata e flow nel catalogo

Aggiungi la action in:
- `public/configs/actions.config.json`

Mantieni allineato anche fallback:
- `src/app/consts/actions-catalog-default.ts`

### Step 3 - Verifica handler

Se usi un handler gia esistente (`safe-place-doctor`, `safe-place-inn`, ecc.) non devi cambiare i type.

Se serve un handler nuovo:

1. aggiungi il nuovo valore in `ActionFlowHandler`:
- `src/app/models/ActionCatalog.ts`

2. aggiorna parser type-guard:
- `ActionCatalogService.isFlowHandler(...)`

3. implementa il branch nel dispatcher:
- `MapPageInteractionService.executeCommandActionFlow(...)`

### Step 4 - Crea la card UI (label/description/disabled)

Aggiungi il branch in:
- `ActionRegistryService.buildActionCard(...)`

Regola pratica:
- usa `commonDisabled` per i validator comuni
- aggiungi solo i gate specifici della tua action (es: soldi minimi, HP mancanti, capacita inventario)

### Step 5 - Implementa gameplay reale nell executor

Aggiungi metodo in:
- `ActionExecutorService`

Template consigliato:

```ts
public async myAction(gameId: string, actor: Pick<Player, "id" | "name">): Promise<void> {
  if (!gameId || !actor.id) {
    throw new Error("Invalid action payload");
  }

  await runTransaction(this.firebaseService.database, async (transaction) => {
    // 1) LOAD
    // 2) VALIDATE (autoritativo)
    // 3) COMPUTE
    // 4) APPLY
  });

  await this.tryCreateLog(gameId, actor, "player.myAction", { /* args */ });
}
```

Validator autoritativi minimi da replicare in executor:

```ts
if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
  throw new Error("It is not your turn");
}

this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using this action");

this.ensureActionAvailable(player, "my-action-id", worldTurn, "You can only use this action once per turn.");
```

### Step 6 - Log

Se riusi un codice log esistente, spesso basta aggiornare args.

Se aggiungi un codice nuovo:

1. aggiungi codice in:
- `src/app/models/EventLog.ts`

2. aggiungi formatter in:
- `src/app/services/event-log-service.ts`

3. (opzionale ma consigliato) aggiungi `log.sourceLabel` nel catalogo action

## 8. Esempio A - Nuova action semplice (senza dialog)

Scenario: `camp-bonfire`
- placement: camp
- trigger: command panel
- dialog: none
- effetto: +1 nutrition e end turn

Catalogo:

```json
{
  "id": "camp-bonfire",
  "ui": {
    "label": "Bonfire",
    "descriptionTemplate": "Camp: gain Nutrition for 1 turn and end turn.",
    "warningTemplate": "Warning: this action needs {requiredSlots} free slots.",
    "i18n": {
      "warningKey": "actions.campBonfire.warning.capacity"
    }
  },
  "flow": {
    "handler": "safe-place-camp-bonfire",
    "errorMessage": "Error while using camp bonfire",
    "trigger": "command-panel",
    "validators": ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
    "dialog": { "type": "none" },
    "requiresMyTurn": true
  },
  "log": {
    "sourceLabel": "Camp Bonfire"
  }
}
```

Poi devi:
- aggiungere handler type + parser
- branch in interaction dispatcher
- metodo executor
- formatter log (se codice nuovo)

## 9. Esempio B - Nuova action con dialog

Scenario: `city-alchemist`
- placement: city
- dialog: resource-exchange

Catalogo:

```json
{
  "id": "city-alchemist",
  "ui": {
    "label": "Alchemist",
    "descriptionTemplate": "City: exchange resources with alchemy rates, then end turn."
  },
  "flow": {
    "handler": "safe-place-resource-exchange",
    "errorMessage": "Error while using city alchemist",
    "trigger": "command-panel",
    "validators": ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
    "dialog": { "type": "resource-exchange" },
    "requiresMyTurn": true
  },
  "log": {
    "sourceLabel": "City Alchemist"
  }
}
```

Se riusi `safe-place-resource-exchange`, spesso non serve nuovo handler.
Se cambiano regole di scambio, crea nuovo handler + nuovo metodo executor.

## 10. Errori comuni da evitare

- Aggiungere action nel catalogo ma non nel placement config
- Aggiungere action nel placement ma senza branch in `ActionRegistryService`
- Fidarsi solo del disabled UI senza validazioni in executor
- Dimenticare `markActionUsed` e/o end turn quando richiesto dal design
- Dimenticare aggiornamento `APP_VERSION`

## 11. Sanity check finale

Prima della commit:

1. apri la cella corretta e verifica che il comando compaia
2. verifica disabled/enabled in base ai vincoli
3. esegui action e controlla update Firestore
4. verifica log finale
5. esegui build

Comando build:

```bash
npm run build
```

## 12. Regola d oro

UI e catalogo guidano il flusso, ma l executor e sempre la fonte di verita.
Se una regola gameplay conta davvero, deve essere validata in transaction.

## 13. Playbook rapido (template operativi)

Questa sezione e pensata per chi deve aggiungere una action velocemente.

### Template 1 - Action senza dialog (esecuzione diretta)

Usa questo template quando il click deve eseguire subito la logica senza input utente.

```json
{
  "id": "camp-bonfire",
  "ui": {
    "label": "Bonfire",
    "descriptionTemplate": "Camp: gain Nutrition for 1 turn and end turn."
  },
  "flow": {
    "handler": "safe-place-camp-bonfire",
    "errorMessage": "Error while using camp bonfire",
    "trigger": "command-panel",
    "validators": ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
    "dialog": {
      "type": "none"
    },
    "requiresMyTurn": true
  },
  "log": {
    "sourceLabel": "Camp Bonfire"
  }
}
```

### Template 2 - Action con dialog di conferma (sanctuary)

Usa questo template quando devi chiedere conferma prima dell esecuzione.

```json
{
  "id": "activate-sanctuary",
  "ui": {
    "label": "Activate",
    "descriptionTemplate": "Donate 5 coins to activate {sanctuaryLabel}, gain 2 XP and attune to its element."
  },
  "flow": {
    "handler": "sanctuary-activate",
    "errorMessage": "Error while activating sanctuary",
    "trigger": "command-panel",
    "validators": ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
    "dialog": {
      "type": "sanctuary-action",
      "sanctuaryMode": "activate",
      "requiredActive": false
    },
    "requiresMyTurn": true
  }
}
```

### Template 3 - Action con dialog di input (resource exchange)

Usa questo template quando il player deve scegliere valori prima dell esecuzione.

```json
{
  "id": "city-alchemist",
  "ui": {
    "label": "Alchemist",
    "descriptionTemplate": "City: exchange resources with alchemy rates, then end turn."
  },
  "flow": {
    "handler": "safe-place-resource-exchange",
    "errorMessage": "Error while using city alchemist",
    "trigger": "command-panel",
    "validators": ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
    "dialog": {
      "type": "resource-exchange"
    },
    "requiresMyTurn": true
  },
  "log": {
    "sourceLabel": "City Alchemist"
  }
}
```

## 14. Passaggi essenziali (riassunto passo-passo)

- Definisci il placement della action in `tiles.config.json` o `landmarks.config.json`.
- Aggiungi la action in `public/configs/actions.config.json` con `id`, `ui`, `flow` e (se utile) `log`.
- Se la action puo avere blocchi "di stato" (non errori), definisci `ui.warningTemplate` e `i18n.warningKey`.
- Allinea il fallback in `src/app/consts/actions-catalog-default.ts`.
- Se l handler non esiste, aggiungilo in `ActionFlowHandler` e nel parser `ActionCatalogService.isFlowHandler(...)`.
- Aggiungi il branch in `MapPageInteractionService.executeCommandActionFlow(...)`.
- Aggiungi/aggiorna il branch card in `ActionRegistryService.buildActionCard(...)`.
- Implementa la logica autoritativa in `ActionExecutorService` (validate, compute, apply).
- Aggiorna i log: `EventLog.ts` + `EventLogService` se introduci un nuovo code.
- Verifica in gioco: comparsa action, stato disabled, esecuzione, update dati, log finale.
- Esegui `npm run build` e aggiorna `APP_VERSION`.
