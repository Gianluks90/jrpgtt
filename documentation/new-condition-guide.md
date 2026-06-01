# Conditions System Guide

Guida pratica e completa per creare nuove conditions dei biomi nel gioco.

Questa documentazione e basata sull'architettura reale del progetto.

---

# Filosofia del sistema

Le conditions descrivono la pressione del mondo.

Non descrivono lo stato del player.

Schema mentale:

```txt
Biome condition -> Regola gameplay -> Effetto sul player
```

Esempio reale:

```txt
hostile-environment -> check in endTurn -> damage HP (se manca nutrition)
```

---

# Flusso completo di una condition

Quando una condition e attiva su un biome:

```txt
public/configs/biome-conditions.config.json
↓
BiomeConditionCatalogService (load + validazione)
↓
tiles.config.json
↓
TilesConfigService (validazione runtime)
↓
MapPageStateService (load config)
↓
ActionExecutorService (regola autoritativa)
↓
Firestore Transaction
↓
EventLogService (opzionale)
```

---

# Regola fondamentale

La UI NON e autoritativa.

Una condition deve essere applicata lato gameplay in `ActionExecutorService`.

---

# File principali coinvolti

| File | Ruolo |
|---|---|
| `public/configs/tiles.config.json` | dichiara le conditions per biome |
| `public/configs/biome-conditions.config.json` | catalogo JSON delle condizioni (effetti, blocchi, log) |
| `src/app/services/biome-condition-catalog-service.ts` | load + validazione + lookup condizioni |
| `src/app/models/TilesConfig.ts` | tipo `conditions: string[]` |
| `src/app/services/tiles-config-service.ts` | validazione runtime config |
| `src/app/services/map-page-state-service.ts` | caricamento config in pagina |
| `src/app/services/action-executor-service.ts` | applicazione regola gameplay |
| `src/app/services/event-log-service.ts` | formatter log condition-related |
| `src/app/models/EventLog.ts` | tipi log |

---

# Creare una nuova condition

---

# STEP 1 - Definisci la condition nel biome

Aggiungi l'id condition dentro il biome corretto in `tiles.config.json`.

Esempio:

```json
"mountain": {
  "label": "Montagne",
  "walkable": true,
  "resources": ["minerals"],
  "actions": ["cell-gather"],
  "conditions": ["freezing-wind"]
}
```

Questo NON applica ancora la regola.

Dice solo:

> in questo biome esiste questa pressione ambientale.

---

# STEP 2 - Valida naming e formato

> Nota localizzativa (dove intervenire)
>
> - `public/configs/tiles.config.json`: controlla che gli id dentro `conditions` siano coerenti e puliti.
> - `src/app/services/tiles-config-service.ts`: qui estendi la validazione runtime se vuoi imporre nuove regole di naming/formato.
> - `src/app/models/TilesConfig.ts`: toccalo solo se cambia il contratto tipizzato (di solito non serve per una nuova condition).

`TilesConfigService` valida che `conditions` sia un array di stringhe non vuote.

Best practice naming:

- usa kebab-case: `freezing-wind`
- usa id descrittivi: `corrosive-fog`, `toxic-rain`
- evita id ambigui: `bad-weather`

---

# STEP 3 - Applica la regola in executor

> Nota localizzativa (dove intervenire)
>
> - `src/app/services/action-executor-service.ts`: punto principale per applicare la regola gameplay autoritativa.
> - Trigger `endTurn`: modifica il metodo `endTurn(...)` nello stesso file.
> - Trigger action-specifica: modifica il metodo action corrispondente nello stesso file.
> - Trigger su movimento: usa il punto autoritativo del movimento in `src/app/services/map-service.ts` e mantieni la regola gameplay lato service (non in UI).

Scegli il trigger corretto:

- `endTurn` per effetti passivi a fine turno;
- action specifica per effetti on-use;
- movimento se l'effetto deve scattare entrando in una cella.

Template standard (autoritativo, config-driven):

```ts
const biomeConfig = tilesConfig.biomes[currentCell.biome];
for (const conditionId of biomeConfig?.conditions ?? []) {
  const condition = this.biomeConditionCatalogService.getCondition(conditionId);
  const effect = condition?.effect;
  if (!effect) continue;

  if (effect.blockedByStatusKey && this.hasStatus(currentStatuses, effect.blockedByStatusKey)) {
    continue;
  }

  // COMPUTE da parametri JSON
  // APPLY dentro transaction
}
```

---

# STEP 4 - Integra eventuale status di protezione

> Nota localizzativa (dove intervenire)
>
> - `src/app/services/action-executor-service.ts`: aggiungi il check `hasStatus(...)` nello stesso punto in cui applichi la condition.
> - `src/app/models/Player.ts`: aggiorna `PlayerStatusKey` solo se introduci una nuova chiave status esplicita a livello dominio.

Pattern corretto:

- condition = mondo
- status = difesa del player

Esempio:

```txt
Condition: freezing-wind
Status: warmth
```

Regola:

```ts
const currentStatuses = this.normalizeStatuses(player.statuses);
const hasWarmth = this.hasStatus(currentStatuses, "warmth");

if (hasCondition && !hasWarmth) {
  // applica penalita
}
```

---

# STEP 5 - Logga l'effetto (se rilevante)

> Nota localizzativa (dove intervenire)
>
> - `src/app/models/EventLog.ts`: aggiungi il nuovo codice evento nel type `EventLogCode`.
> - `src/app/services/event-log-service.ts`: aggiungi il formatter testuale del nuovo codice log.
> - `src/app/services/action-executor-service.ts`: invoca `tryCreateLog(...)` nel punto in cui l'effetto viene realmente applicato.

Se la condition produce un effetto visibile (damage, drain, ecc.), aggiungi log.

In `EventLog.ts`:

```ts
| "player.freezingWindDamage"
```

In `EventLogService`:

```ts
"player.freezingWindDamage": ({ playerName, args }) => {
  const damageHp = Number(args["damageHp"] ?? 0);
  return `${playerName} suffered ${damageHp} HP from freezing wind.`;
},
```

Nell'executor:

```ts
await this.tryCreateLog(gameId, actor, "player.freezingWindDamage", {
  damageHp,
});
```

---

# Esempio reale gia presente nel progetto

Condition attuale: `hostile-environment` sul biome desert.

Effetto:

- in `endTurn`, se il player non ha status `nutrition`, subisce danno HP;
- il danno scala con la size dell'environment connesso;
- poi viene scritto log `player.hostileEnvironmentDamage`.

Pattern reale semplificato:

```ts
for (const conditionId of biomeConfig?.conditions ?? []) {
  const condition = this.biomeConditionCatalogService.getCondition(conditionId);
  const effect = condition?.effect;
  if (!effect) continue;

  if (effect.blockedByStatusKey && this.hasStatus(currentStatuses, effect.blockedByStatusKey)) {
    continue;
  }

  // delta HP da basePercentPerConnectedCell (+ maxPercent/minDeltaHp)
  // poi update hp e log
}
```

---

# Errori da evitare

- Applicare la condition solo nella UI.
- Dimenticare il check nel path autorevole (executor).
- Usare nomi non coerenti tra config e codice.
- Fare update gameplay fuori transaction.
- Non loggare effetti importanti (debug piu difficile).

---

# Checklist completa nuova condition

- [ ] Condition aggiunta nel biome in `tiles.config.json`
- [ ] Naming condition coerente e stabile
- [ ] Trigger scelto (end turn / action / move)
- [ ] Regola implementata in `ActionExecutorService`
- [ ] Eventuale interazione con status implementata
- [ ] Update Firestore fatti in transaction
- [ ] Event log aggiunto (se effetto rilevante)
- [ ] Testata in game su happy path + error path

---

# Checklist rapida (uso quotidiano)

- [ ] Aggiungi id condition nel biome
- [ ] Leggi condition con `(biomeConfig?.conditions ?? []).includes(...)`
- [ ] Applica effetto nel punto autorevole (executor)
- [ ] Se serve, proteggi con `hasStatus(...)`
- [ ] Aggiorna player/world dentro transaction
- [ ] Logga l'effetto se visibile
- [ ] Verifica risultato in partita
