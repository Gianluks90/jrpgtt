# Player Status System Guide

Guida pratica e completa per creare nuovi status del player nel gioco.

Questa documentazione e basata sull'architettura reale del progetto.

---

# Filosofia del sistema

Gli status descrivono lo stato del player.

Non descrivono il mondo.

Schema mentale:

```txt
Action o regola -> Status applicato al player -> Effetti gameplay nei turni successivi
```

Esempio reale:

```txt
consume-ration -> status nutrition -> immunity al danno hostile-environment
```

---

# Flusso completo di uno status

```txt
public/configs/statuses.config.json
↓
StatusCatalogService (load + validazione)
↓
ActionExecutorService (grant/refresh status)
↓
Firestore Transaction (player.statuses)
↓
ActionExecutorService (read status in altre regole)
↓
Decrement/cleanup (lifecycle)
↓
EventLogService (opzionale)
```

---

# Struttura dati status

Gli status vivono in `player.statuses`.

Formato:

```ts
{
  key: "nutrition",
  label: "Nutrition",
  description: "Prevents hostile desert damage for this turn.",
  durationTurns: 1,
  effectKey: "optional-effect-id",
}
```

Campi chiave:

- `key`: id univoco dello status
- `label`: nome leggibile
- `description`: descrizione effetto
- `durationTurns`: durata residua in turni
- `effectKey` (opzionale): hook per regole future

---

# File principali coinvolti

| File | Ruolo |
|---|---|
| `public/configs/statuses.config.json` | catalogo JSON di label/description/default duration/effectKey |
| `src/app/services/status-catalog-service.ts` | load + validazione + lookup status |
| `src/app/models/Player.ts` | tipi `PlayerStatus` e `player.statuses` |
| `src/app/services/action-executor-service.ts` | grant/read/decrement status |
| `src/app/services/action-registry-service.ts` | UX conditionale basata su status (non autoritativa) |
| `src/app/models/EventLog.ts` | tipi log status-related |
| `src/app/services/event-log-service.ts` | formatter log status-related |

---

# Utility status disponibili

Nel progetto (in `ActionExecutorService`) hai gia helper riutilizzabili:

## normalizeStatuses

Pulisce e normalizza dati invalidi.

```ts
this.normalizeStatuses(player.statuses)
```

## hasStatus

Controlla presenza status attivo.

```ts
this.hasStatus(statuses, "nutrition")
```

## decrementStatuses

Riduce `durationTurns` e rimuove scaduti.

```ts
this.decrementStatuses(statuses)
```

## upsertStatus

Inserisce o refresha status con la stessa key.

```ts
this.upsertStatus(statuses, nextStatus)
```

---

# Creare un nuovo status

---

# STEP 1 - Definisci status key e semantica

Scegli:

- key stabile: `warmth`, `focus`, `bleeding`
- trigger di applicazione
- trigger di consumo
- durata in turni

Esempio:

```txt
Status key: warmth
Durata: 2 turni
Effetto: riduce o annulla danno da freezing-wind
```

---

# STEP 2 - Definisci catalogo JSON e applica lo status in executor

Prima aggiungi/aggiorna la definizione in `public/configs/statuses.config.json`.
Poi dentro un'azione (o regola) usa `StatusCatalogService` + `upsertStatus(...)`.

Template:

```ts
await this.statusCatalogService.loadConfig();
const warmth = this.statusCatalogService.getStatus("warmth");
if (!warmth) throw new Error("Missing status definition for 'warmth'");

const nextStatuses = this.upsertStatus(this.normalizeStatuses(player.statuses), {
  key: warmth.key,
  label: warmth.label,
  description: warmth.description,
  durationTurns: warmth.defaultDurationTurns,
  effectKey: warmth.effectKey,
});

transaction.set(playerRef, {
  statuses: nextStatuses,
}, { merge: true });
```

Importante:

- sempre dentro transaction;
- key uguale = refresh durata, non duplicazione.

---

# STEP 3 - Usa lo status nelle regole gameplay

Leggi status dove serve (sempre lato executor).

Template:

```ts
const currentStatuses = this.normalizeStatuses(player.statuses);
const hasWarmth = this.hasStatus(currentStatuses, "warmth");

if (isFreezingWind && !hasWarmth) {
  // applica danno o penalita
}
```

---

# STEP 4 - Gestisci lifecycle e scadenza

Pattern tipico nel progetto:

```ts
const currentStatuses = this.normalizeStatuses(player.statuses);
const nextStatuses = this.decrementStatuses(currentStatuses);

transaction.set(playerRef, {
  statuses: nextStatuses,
}, { merge: true });
```

Questo mantiene gli status coerenti a ogni fine turno.

---

# STEP 5 - Aggiorna UX e log (se utile)

UX opzionale:

- nel registry puoi disabilitare azioni se uno status e gia attivo;
- ricordati che e solo UX, non sicurezza.

Pattern reale (`consume-ration`):

```ts
const hasNutrition = (player.statuses ?? []).some((status) => status.key === "nutrition" && status.durationTurns > 0);
```

Log opzionale:

In `EventLog.ts`:

```ts
| "player.gainWarmth"
```

In `EventLogService`:

```ts
"player.gainWarmth": ({ playerName, args }) => {
  const durationTurns = Number(args["durationTurns"] ?? 0);
  return `${playerName} gained Warmth for ${durationTurns} turns.`;
},
```

---

# Esempio reale gia presente nel progetto

Status attuale: `nutrition`.

Flow reale:

1) `consume-ration` spende 1 food;
2) carica definizione `nutrition` da `statuses.config.json` e applica via `upsertStatus`;
3) in `endTurn`, `hostile-environment` controlla `hasStatus("nutrition")`;
4) gli status vengono decrementati con `decrementStatuses`.

Snippet semplificato:

```ts
const nextStatuses = this.upsertStatus(this.normalizeStatuses(player.statuses), {
  key: nutritionStatus.key,
  label: nutritionStatus.label,
  description: nutritionStatus.description,
  durationTurns: nutritionStatus.defaultDurationTurns,
});
```

---

# Errori da evitare

- Creare status solo in UI senza check gameplay.
- Dimenticare `normalizeStatuses` prima dei controlli.
- Dimenticare il decrement (status infiniti involontari).
- Duplicare status invece di fare upsert.
- Usare key incoerenti in punti diversi.

---

# Checklist completa nuovo status

- [ ] Definiti key/label/description/durationTurns
- [ ] Status applicato in `ActionExecutorService` con `upsertStatus`
- [ ] Status letto nelle regole gameplay con `hasStatus`
- [ ] Lifecycle gestito con `decrementStatuses`
- [ ] Update Firestore eseguiti in transaction
- [ ] UX opzionale aggiornata in registry (se serve)
- [ ] Event log aggiunto (se rilevante)
- [ ] Testato in game su happy path + scadenza status

---

# Checklist rapida (uso quotidiano)

- [ ] Crea key status chiara e stabile
- [ ] Applica con `upsertStatus(normalizeStatuses(...), status)`
- [ ] Verifica effetto con `hasStatus(...)` nella regola giusta
- [ ] Decrementa a fine turno con `decrementStatuses(...)`
- [ ] Mantieni tutto dentro transaction
- [ ] Aggiungi log se lo status ha effetto visibile
- [ ] Verifica in partita: gain, effetto, scadenza
