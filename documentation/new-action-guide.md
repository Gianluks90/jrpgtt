# Action Catalog Guide

Guida aggiornata per aggiungere nuove action nel flusso config-driven.
Obiettivo: estendere il gameplay senza rompere UI, dispatch e validazioni autoritative.

## 1. Flusso reale (config -> esecuzione)

Quando l utente clicca una action nel command panel:

1. `public/configs/actions.config.json`
2. `src/app/services/action-catalog-service.ts`
3. `src/app/services/map-page-actions-service.ts`
4. `src/app/services/action-registry-service.ts`
5. `src/app/services/map-page-interaction-service.ts`
6. `src/app/services/action-executor-service.ts`
7. `src/app/services/event-log-service.ts`

Sintesi:
- catalogo: metadata UI + flow
- registry: card UI (label/description/warning/disabled)
- interaction: dispatch su handler/dialog
- executor: regole gameplay in transaction (fonte di verita)
- event log: messaggio finale e source label

Nota fallback:
- se `actions.config.json` non viene caricato, resta attivo il fallback in `src/app/consts/actions-catalog-default.ts`

## 2. Placement della action

Una action deve essere dichiarata sia nel catalogo che nel placement mappa.

Placement:
- biome actions: `public/configs/tiles.config.json` -> `biomes.<biome>.actions`
- safe landmark actions: `public/configs/landmarks.config.json` -> `safePlaceActionsByLandmark.<landmarkId>`
- sanctuary actions: `public/configs/tiles.config.json` -> `specialTiles.sanctuaries.<element>.actions`

Catalogo behavior:
- `public/configs/actions.config.json`

## 3. Schema minimo della action

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

## 4. Enumerazioni supportate (allineate al codice)

`flow.trigger`:
- `command-panel`

`flow.validators`:
- `my-turn`
- `moved-this-turn`
- `not-busy`
- `action-not-used`

`flow.dialog.type`:
- `none`
- `sanctuary-action`
- `doctor-heal`
- `resource-exchange`
- `safe-place-fast-travel`

Campi sanctuary dialog:
- `sanctuaryMode`: `activate` | `donate`
- `requiredActive`: `true` | `false`

Guardie di flusso addizionali:
- `requiresMyTurn`
- `requiresCanEndTurn`

## 5. Warning UI config-driven

Per warning non bloccanti (es. capacita inventario), usare il catalogo:
- `ui.warningTemplate`
- `ui.i18n.warningKey`

Esempio:

```json
"ui": {
  "label": "Gatherer",
  "descriptionTemplate": "Camp: gain 1 timber and 1 minerals, then end turn.",
  "warningTemplate": "Warning: camp reward needs {requiredSlots} free slots, available {availableSlots}.",
  "i18n": {
    "warningKey": "actions.campGatherer.warning.capacity"
  }
}
```

## 6. Procedura passo-passo

1. Definisci placement
- aggiorna `tiles.config.json` o `landmarks.config.json` (o entrambi, se serve).

2. Aggiungi la action al catalogo
- inserisci entry in `public/configs/actions.config.json`.
- allinea il fallback in `src/app/consts/actions-catalog-default.ts`.

3. Verifica handler
- se riusi handler esistente, salta ai passi successivi.
- se introduci handler nuovo:
  - aggiorna `ActionFlowHandler` in `src/app/models/ActionCatalog.ts`
  - aggiorna `isFlowHandler(...)` in `src/app/services/action-catalog-service.ts`
  - aggiungi branch in `executeCommandActionFlow(...)` in `src/app/services/map-page-interaction-service.ts`

4. Costruisci la card UI
- aggiungi/aggiorna branch in `buildActionCard(...)` in `src/app/services/action-registry-service.ts`
- usa `commonDisabled` per i validator comuni
- aggiungi solo i gate specifici dell action

5. Implementa logica autoritativa
- aggiungi metodo in `src/app/services/action-executor-service.ts`
- validazioni minime in transaction:

```ts
if (worldState.activePlayerId && worldState.activePlayerId !== actor.id) {
  throw new Error("It is not your turn");
}

this.ensurePlayerMovedThisTurn(worldState, actor.id, "You must move before using this action");
this.ensureActionAvailable(player, "my-action-id", worldTurn, "You can only use this action once per turn.");
```

6. Aggiorna log
- se usi codice log gia esistente: aggiorna solo args dove serve.
- se aggiungi codice nuovo:
  - aggiungi type in `src/app/models/EventLog.ts`
  - aggiungi formatter in `src/app/services/event-log-service.ts`
  - configura `log.sourceLabel` nel catalogo action

## 7. Errori frequenti

- action presente nel placement ma assente nel catalogo
- action presente nel catalogo ma non nel placement
- card UI aggiunta senza branch dispatcher in interaction
- validazioni solo lato UI, senza enforcement in executor
- mancato aggiornamento fallback catalog
- mancato aggiornamento APP_VERSION

## 8. Sanity check finale

1. verifica che la action compaia nella cella corretta
2. verifica stato enabled/disabled in base ai vincoli
3. esegui la action e controlla update dati
4. verifica event log
5. esegui build

```bash
npm run build
```

## 9. Regola d oro

Catalogo e UI guidano il flusso.
Executor valida e applica sempre la regola gameplay definitiva.
