# Guida: Status del player

Gli status sono condizioni temporanee che si applicano al player per un numero definito di turni. Possono potenziare, indebolire o modificare il comportamento del player in vari modi.

Esempi: `nutrition` (protegge dal deserto), `bravery` (+1 Strength), `poison` (danno a fine turno), `silence` (blocca gli spell).

---

## Basta il JSON?

**Per definire lo status**: sì, è tutto in `statuses.config.json`.
**Per applicarlo al player**: dipende. L'unico modo senza codice è tramite uno spell con `effect.type: "apply-status-self"`. Per qualsiasi altra sorgente (un'azione, un evento, una condition) serve uno sviluppatore.

---

## File da toccare

| File | Cosa scrivi |
|---|---|
| `public/configs/statuses.config.json` | Definisci lo status (key, label, durata, effetti) |

Per applicarlo tramite spell (niente codice):
| File aggiuntivo | Cosa scrivi |
|---|---|
| `public/configs/spells.config.json` | Crea uno spell con `effect.type: "apply-status-self"` |

---

## Schema completo

```json
{
  "key": "warmth",
  "label": "Warmth",
  "description": "Protects from freezing damage for this turn.",
  "defaultDurationTurns": 2,
  "iconUrl": "/status-icons/buff-icon.svg",
  "i18n": {
    "labelKey": "statuses.warmth.label",
    "descriptionKey": "statuses.warmth.description"
  },
  "effects": {
    "statModifiers": { "strength": 1 }
  }
}
```

| Campo | Obbligatorio | Note |
|---|---|---|
| `key` | sì | Univoco, kebab-case |
| `label` | sì | Nome visibile |
| `description` | sì | Descrizione dell'effetto |
| `defaultDurationTurns` | sì | Durata default in turni |
| `iconUrl` | sì | Percorso icona (usa quelle già esistenti, vedi sotto) |
| `i18n` | sì | Chiavi localizzazione |
| `effects` | no | Effetti applicati automaticamente dal motore (vedi sotto) |
| `effectKey` | no | Chiave per comportamenti speciali implementati in codice |

### Icone esistenti (riusa quando possibile)
- `/status-icons/buff-icon.svg` — effetti positivi generici
- `/status-icons/debuff-icon.svg` — effetti negativi generici
- `/status-icons/protection-icon.svg` — protezioni e scudi
- `/status-icons/nutrition-icon.svg` — nutrizione
- `/status-icons/poison-icon.svg` — veleno
- `/status-icons/regen-icon.svg` — rigenerazione
- `/status-icons/lucky-icon.svg` — fortuna
- `/status-icons/sleep-icon.svg` — sonno
- `/status-icons/immobilized-icon.svg` — immobilizzato
- `/status-icons/silence-icon.svg` — silenzio
- `/status-icons/mouse-icon.svg` — trasformazione
- `/status-icons/invisility-icon.svg` — invisibilità

---

## Effetti automatici (`effects`)

Questi effetti vengono applicati automaticamente dal motore senza codice aggiuntivo.

### `turnEndHpPercentDelta`
Modifica HP in percentuale a fine turno.
- Negativo = danno (es. `poison`)
- Positivo = cura (es. `regen`)

```json
"effects": { "turnEndHpPercentDelta": -0.05 }
```

---

### `statModifiers`
Modifica temporanea ai parametri del player.

```json
"effects": {
  "statModifiers": { "strength": 1 }
}
```

Parametri supportati: `strength`, `magic`

---

### `luckBonusMultiplier`
Moltiplica il bonus fortuna applicato nei luck check.

```json
"effects": { "luckBonusMultiplier": 2 }
```

---

### `skipTurns`
Fa saltare un certo numero di turni al player.

```json
"effects": { "skipTurns": 1 }
```

---

### `incomingDamageMultiplier`
Modifica il danno ricevuto dal player.
- 0.5 = dimezza il danno
- 0 = immunità totale

```json
"effects": { "incomingDamageMultiplier": 0.5 }
```

---

### `cannotMove`
Blocca il movimento del player.

```json
"effects": { "cannotMove": true }
```

---

### `disableSpellCasting`
Impedisce il lancio degli spell.

```json
"effects": { "disableSpellCasting": true }
```

---

### `disableMpNaturalRegen`
Disabilita la rigenerazione naturale degli MP.

```json
"effects": { "disableMpNaturalRegen": true }
```

---

### `disableHpRecovery` / `disableMpRecovery`
Disabilita il recupero di HP e/o MP.

```json
"effects": { "disableHpRecovery": true, "disableMpRecovery": true }
```

---

### `disableItemUse`
Blocca l'uso degli oggetti.

```json
"effects": { "disableItemUse": true }
```

---

### `setPrimaryStatsTo`
Forza tutti i parametri primari (STR, MAGIC, LUCK) a un valore fisso.

```json
"effects": { "setPrimaryStatsTo": 1 }
```

---

### `cannotBeAttacked` / `cannotBeTargetedBySpells`
Rende il player immune agli attacchi e/o agli spell ostili.

```json
"effects": { "cannotBeAttacked": true, "cannotBeTargetedBySpells": true }
```

---

## `effectKey` (comportamenti speciali in codice)

Alcuni status usano una stringa `effectKey` per attivare logiche implementate direttamente nel codice del gioco. Non richiedono un campo `effects`.

| effectKey | Comportamento |
|---|---|
| `enable-diagonal-movement` | Abilita il movimento diagonale finché lo status è attivo |
| `add-magic-to-strength-in-combat` | In combattimento, aggiunge Magic a Strength |
| `ignore-next-harmful-cell-effect` | Ignora il prossimo effetto negativo da cella/bioma |
| `reduce-next-damage-with-mp` | Riduce il prossimo danno ricevuto spendendo MP residui |
| `negate-next-hostile-spell` | Nega il prossimo spell ostile ricevuto |
| `preview-next-random-outcome` | Mostra in anticipo il prossimo risultato casuale |
| `temporary-attunement-fire` | Sintonizzazione temporanea all'elemento fuoco |
| `temporary-attunement-earth` | Sintonizzazione temporanea all'elemento terra |
| `temporary-attunement-air` | Sintonizzazione temporanea all'elemento aria |
| `temporary-attunement-water` | Sintonizzazione temporanea all'elemento acqua |

Per aggiungere un nuovo `effectKey` serve uno sviluppatore.

---

## Status esistenti (riferimento completo)

| Key | Effetto | Durata |
|---|---|---|
| `nutrition` | Blocca danno `hostile-environment` | 1 turno |
| `poison` | -5% HP a fine turno | 3 turni |
| `regen` | +5% HP a fine turno | 3 turni |
| `bravery` | +1 Strength | 1 turno |
| `weakened` | -1 Strength | 1 turno |
| `focus` | +1 Magic | 1 turno |
| `hexed` | -1 Magic | 1 turno |
| `fortune` | Bonus fortuna x2 | 1 turno |
| `protection` | Danno ricevuto x0.5 | 1 turno |
| `silence` | Blocca spell e regen MP naturale | 3 turni |
| `sleep` | Salta 1 turno | 1 turno |
| `petrified` | Salta 1 turno | 1 turno |
| `minified` | Tutti i parametri a 1, blocca items e recovery | 1 turno |
| `invisibility` | Non attaccabile né prendibile di mira | 1 turno |
| `immobilized` | Non può muoversi | 1 turno |
| `anchored` | Non può muoversi | 1 turno |
| `flying` | Movimento diagonale abilitato | 1 turno |
| `empowered` | Magic si aggiunge a Strength in combattimento | 1 turno |
| `safe-step` | Ignora il prossimo effetto negativo da cella | 1 turno |
| `mana-shield` | Riduce il prossimo danno spendendo MP | 1 turno |
| `spell-ward` | Nega il prossimo spell ostile ricevuto | 1 turno |
| `fate-sight` | Anteprima del prossimo risultato casuale | 1 turno |
| `elemental-bound-fire/earth/air/water` | Sintonizzazione temporanea a un elemento | 1 turno |

---

## Come applicare uno status al player

### Opzione A: Via spell (niente codice)
Crea uno spell con `effect.type: "apply-status-self"` (vedi [new-spell-guide.md](new-spell-guide.md)).

```json
"effect": {
  "type": "apply-status-self",
  "statusKey": "bravery",
  "baseDurationTurns": 1,
  "durationPerMagic": 0
}
```

### Opzione B: Via azione o evento (richiede sviluppatore)
Lo sviluppatore aggiungerà `upsertStatus(...)` nel punto corretto di `src/app/services/gameplay/action-executor-service.ts`.

---

## Checklist

- [ ] Entry aggiunta nell'array `statuses` di `statuses.config.json`
- [ ] `key` univoca e in kebab-case
- [ ] `iconUrl` punta a un'icona esistente (vedi lista sopra)
- [ ] `defaultDurationTurns` appropriato
- [ ] Se ha `effects`: tutti i campi sono tra quelli supportati
- [ ] Se ha `effectKey`: la chiave esiste già nel codice (o è stata aggiunta dallo sviluppatore)
- [ ] Il trigger di applicazione è configurato (spell) o implementato dallo sviluppatore
- [ ] Verifica in gioco: lo status compare sulla scheda player, dura i turni giusti, l'effetto si applica
