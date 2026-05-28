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

`TilesConfigService` valida che `conditions` sia un array di stringhe non vuote.

Best practice naming:

- usa kebab-case: `freezing-wind`
- usa id descrittivi: `corrosive-fog`, `toxic-rain`
- evita id ambigui: `bad-weather`

---

# STEP 3 - Applica la regola in executor

Scegli il trigger corretto:

- `endTurn` per effetti passivi a fine turno;
- action specifica per effetti on-use;
- movimento se l'effetto deve scattare entrando in una cella.

Template standard (autoritativo):

```ts
const biomeConfig = tilesConfig.biomes[currentCell.biome];
const hasCondition = (biomeConfig?.conditions ?? []).includes("freezing-wind");

if (hasCondition && !hasProtectionStatus) {
  // COMPUTE
  const damageHp = ...;

  // APPLY (dentro transaction)
  transaction.set(playerRef, {
    parameters: {
      ...player.parameters,
      hp: {
        ...player.parameters.hp,
        current: nextHpCurrent,
      },
    },
  }, { merge: true });
}
```

---

# STEP 4 - Integra eventuale status di protezione

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
const isHostileEnvironment = (biomeConfig?.conditions ?? []).includes("hostile-environment");
const currentStatuses = this.normalizeStatuses(player.statuses);
const hasNutrition = this.hasStatus(currentStatuses, "nutrition");

if (isHostileEnvironment && !hasNutrition) {
  const environmentSize = await this.computeConnectedBiomeSize(...);
  const damageHp = ...;
  nextHpCurrent = Math.max(0, nextHpCurrent - damageHp);
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
