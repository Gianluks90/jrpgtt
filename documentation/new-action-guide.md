# Guida: Azione (Action)

Le azioni sono le cose che il player può fare in una cella della mappa: raccogliere risorse, pregare in un santuario, riposare in un landmark, ecc.

---

## Basta il JSON?

**Sì**, se riusi un handler già esistente (vedi lista completa sotto). In questo caso tocchi solo file JSON.
**No (serve sviluppatore)**, se vuoi che l'azione faccia qualcosa di mai visto nel gioco.

---

## File da toccare

| File | Cosa scrivi |
|---|---|
| `public/configs/actions.config.json` | Definizione dell'azione (etichetta, handler, validators) |
| `public/configs/tiles.config.json` | Placement su biomi e santuari |
| `public/configs/landmarks.config.json` | Placement su landmark |

Ogni action deve stare sia nel catalogo che in almeno un placement.

---

## Dove appare un'azione sulla mappa (placement)

### Su un bioma
In `tiles.config.json`, sezione `biomes.<nome>.actions`:
```json
"forest": {
  "actions": ["cell-gather", "chop-tree"]
}
```

### Su un santuario
In `tiles.config.json`, sezione `specialTiles.sanctuaries.<elemento>.actions`:
```json
"water": {
  "actions": {
    "inactive": ["activate-sanctuary"],
    "active": ["sanctuary"]
  }
}
```

### Su un landmark safe (Capital, City, Village, Camp)
In `landmarks.config.json`, sezione `safePlaceActionsByLandmark`:
```json
"capital": ["safe-place-wait", "fast-travel", "capital-doctor"]
```

### Su un landmark mid (Castle, Temple, ecc.)
In `landmarks.config.json`, sezione `midPlaceActionsByLandmark`:
```json
"castle": ["castle-rest", "castle-trainer"]
```

### Su un landmark bad (Cave, Dungeon, ecc.)
In `landmarks.config.json`, sezione `badPlaceActionsByLandmark`:
```json
"altar": ["altar-sacrifice"]
```

---

## Schema in `actions.config.json`

```json
{
  "id": "mia-action",
  "ui": {
    "label": "Etichetta",
    "descriptionTemplate": "Descrizione visibile al player.",
    "warningTemplate": "Avviso opzionale (es. slot necessari: {requiredSlots}).",
    "i18n": {
      "labelKey": "actions.miaAction.label",
      "descriptionKey": "actions.miaAction.description",
      "warningKey": "actions.miaAction.warning"
    }
  },
  "flow": {
    "handler": "biome-cell-gather",
    "errorMessage": "Errore nell'eseguire mia-action",
    "trigger": "command-panel",
    "validators": ["my-turn", "moved-this-turn", "not-busy", "action-not-used"],
    "requiresMyTurn": true,
    "requiresCanEndTurn": false
  },
  "log": {
    "sourceLabel": "Mia Action"
  }
}
```

| Campo | Note |
|---|---|
| `id` | Univoco, kebab-case |
| `ui.label` | Etichetta del pulsante |
| `ui.descriptionTemplate` | Testo descrittivo mostrato al player |
| `ui.warningTemplate` | (opzionale) Avviso non bloccante |
| `flow.handler` | Cosa fa l'azione (vedi lista handler sotto) |
| `flow.trigger` | Sempre `"command-panel"` |
| `flow.validators` | Condizioni che devono essere vere per abilitarla |
| `flow.requiresMyTurn` | `true` = visibile solo nel proprio turno |
| `flow.requiresCanEndTurn` | `true` = richiede la possibilità di finire il turno |
| `log.sourceLabel` | Etichetta usata nei messaggi del log di gioco |

---

## Handler disponibili

Gli handler definiscono il comportamento dell'azione. Riusa sempre uno esistente quando possibile.

### Azioni su bioma

| Handler | Esempio reale | Cosa fa |
|---|---|---|
| `biome-cell-gather` | `cell-gather` | Raccoglie una risorsa casuale dal bioma (luck check) |
| `biome-chop-tree` | `chop-tree` | Taglia legno nella foresta (richiede ascia) |
| `biome-consume-ration` | `consume-ration` | Consuma 1 razione → applica status `nutrition` |

### Azioni su santuario

| Handler | Esempio reale | Cosa fa |
|---|---|---|
| `sanctuary-open` | `sanctuary` | Apre il menu del santuario attivo |
| `sanctuary-activate` | `activate-sanctuary` | Attiva il santuario (richiede monete) |
| `sanctuary-donate` | `donate-sanctuary` | Dona al santuario (sposta l'attunement) |
| `sanctuary-pray` | `pray-sanctuary` | Prega per ricevere guarigione (luck check) |

### Azioni in safe place (Capital, City, Village, Camp)

| Handler | Esempio reale | Cosa fa |
|---|---|---|
| `safe-place-doctor` | `capital-doctor`, `city-healer` | Cura HP a pagamento |
| `safe-place-enchantress` | `capital-enchantress` | Premio magico variabile |
| `safe-place-mystic` | `city-mystic` | Carta destino con effetti variabili (allineamento, XP, ecc.) |
| `safe-place-merchant` | `city-merchant`, `academy-merchant` | Compra e vendi oggetti |
| `safe-place-inn` | `capital-inn` | Riposo (heal HP + fine turno) |
| `safe-place-resource-exchange` | `village-craftsman` | Scambia una risorsa con un'altra |
| `safe-place-wait` | `safe-place-wait` | Aspetta sul posto (simula movimento sulla stessa cella + fine turno) |
| `safe-place-fast-travel` | `fast-travel` | Prenota viaggio rapido verso altro safe place |
| `safe-place-camp-gatherer` | `camp-gatherer` | Ottieni risorse raccogliendo dal campo |
| `safe-place-camp-hunter` | `camp-hunter` | Ottieni risorse cacciando dal campo |

### Azioni in landmark mid/bad

| Handler | Esempio reale | Cosa fa |
|---|---|---|
| `graveyard-resurrect` | `graveyard-resurrect` | Tenta di resuscitare un seguace morto |
| `temple-send-devotee` | `temple-send-devotee` | Invia un devoto (diventa GOOD, ottieni XP) |
| `altar-sacrifice` | `altar-sacrifice` | Sacrificio (diventa EVIL, ottieni XP) |
| `landmark-rest` | `castle-rest` | Riposo nel landmark (heal HP + fine turno) |
| `landmark-trainer` | `castle-trainer`, `academy-trainer` | Allena un parametro a pagamento (fine turno + salta il turno successivo) |

### Azioni seguace

| Handler | Esempio reale | Cosa fa |
|---|---|---|
| `follower-feed-horse` | `feed-horse` | Nutre il cavallo → +1 movimento per quel turno |
| `follower-eliminate-zombie` | `eliminate-zombie` | Elimina lo zombie dal party |

### Altro

| Handler | Esempio reale | Cosa fa |
|---|---|---|
| `end-turn` | `end-turn` | Termina il turno del player |

---

## Validators disponibili

Bloccano il pulsante dell'azione se le condizioni non sono soddisfatte.

| Validator | Quando blocca |
|---|---|
| `my-turn` | Non è il turno del player |
| `moved-this-turn` | Il player non si è ancora mosso in questo turno |
| `not-busy` | Il player sta già eseguendo un'azione |
| `action-not-used` | Questa stessa azione è già stata usata in questo turno |

---

## Dialog (quando serve una conferma prima di procedere)

Alcune azioni aprono una finestra di dialogo prima di eseguire.

```json
"flow": {
  "dialog": { "type": "doctor-heal" }
}
```

Tipi di dialog disponibili:
- `doctor-heal` → seleziona quanti trattamenti acquistare
- `sanctuary-action` → conferma attivazione/donazione santuario (richiede anche `sanctuaryMode: "activate"` o `"donate"` e `requiredActive: true/false`)
- `resource-exchange` → seleziona le risorse da scambiare
- `safe-place-fast-travel` → seleziona la destinazione del viaggio rapido

---

## Avvisi non bloccanti (`warningTemplate`)

Per mostrare un avviso visibile senza disabilitare l'azione:

```json
"ui": {
  "warningTemplate": "Attenzione: servono {requiredSlots} slot liberi, disponibili {availableSlots}.",
  "i18n": {
    "warningKey": "actions.miaAction.warning.capacity"
  }
}
```

---

## Pattern utili

### Azione con luck check
Quasi tutte le azioni di raccolta (cell-gather, pray-sanctuary) usano un luck check interno. Non c'è un campo JSON per controllarlo: è gestito dal codice dell'handler.

### Azione con costo in monete
Alcune azioni (dottore, albergatore, trainer) deducono monete. Il costo è configurabile nei parametri dell'handler. Chiedi allo sviluppatore dove si trova il config specifico.

### Azione che termina il turno
Gli handler come `safe-place-inn`, `landmark-rest`, `safe-place-camp-gatherer` terminano sempre il turno automaticamente. Non c'è un flag JSON da impostare: dipende dall'implementazione dell'handler.

---

## Quando serve uno sviluppatore

Se il tuo handler non è in lista, oppure vuoi:
- Una logica gameplay completamente nuova
- Un tipo di dialog nuovo
- Un nuovo codice log

Lo sviluppatore dovrà intervenire su:
1. `src/app/models/catalog/ActionCatalog.ts` — aggiunge il tipo handler
2. `src/app/services/catalog/action-catalog-service.ts` — registra il validator
3. `src/app/services/map/map-page-interaction-service.ts` — aggiunge il dispatcher
4. `src/app/services/gameplay/action-registry-service.ts` — costruisce la card UI
5. `src/app/services/gameplay/action-executor-service.ts` — implementa la logica autoritativa
6. `src/app/models/ui/EventLog.ts` e `src/app/services/gameplay/event-log-service.ts` — se serve un nuovo codice log
7. `src/app/consts/catalog/actions-catalog-default.ts` — allinea il fallback

---

## Checklist (caso base: handler esistente)

- [ ] Entry aggiunta in `actions.config.json`
- [ ] `id` univoco e in kebab-case
- [ ] Handler è uno tra quelli disponibili in lista
- [ ] Placement aggiunto nel file corretto (`tiles.config.json` o `landmarks.config.json`)
- [ ] Validators coerenti con la logica dell'azione
- [ ] Verifica in gioco: l'azione compare nella cella corretta, è abilitata/disabilitata correttamente, esegue e produce il log
