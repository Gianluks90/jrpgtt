# Guida: Condizione ambientale (Biome Condition)

Le conditions descrivono la pressione ambientale di un bioma: il danno del deserto, la guarigione delle acque, le risorse abbondanti di una pianura fertile, ecc. Non agiscono sul player nella config, ma vengono applicate automaticamente dal motore di gioco (di solito a fine turno).

---

## Basta il JSON?

**Sì**, se usi uno dei tipi di effetto già implementati (elencati sotto).
**No (serve sviluppatore)**, se vuoi un tipo di effetto completamente nuovo.

---

## File da toccare

| File | Cosa scrivi |
|---|---|
| `public/configs/biome-conditions.config.json` | Definisci la condition e il suo effetto |
| `public/configs/tiles.config.json` | Assegna la condition a uno o più biomi |

---

## Passo 1: Definisci la condition in `biome-conditions.config.json`

Aggiungi un oggetto nell'array `conditions`:

```json
{
  "id": "freezing-wind",
  "label": "Freezing Wind",
  "description": "Inflicts HP damage at end of turn. Blocked by Warmth.",
  "logCode": "player.freezingWindDamage",
  "effect": {
    "type": "hp-damage-percent-per-connected-cell",
    "basePercentPerConnectedCell": 0.03,
    "minDeltaHp": 1,
    "blockedByStatusKey": "warmth"
  }
}
```

| Campo | Obbligatorio | Note |
|---|---|---|
| `id` | sì | Univoco, kebab-case |
| `label` | sì | Nome visibile |
| `description` | sì | Descrizione del bioma |
| `logCode` | no | Codice log per l'evento (deve esistere già in codice) |
| `effect` | no | Definisce cosa fa la condition (vedi tipi sotto) |

---

## Passo 2: Assegna la condition a un bioma in `tiles.config.json`

Aggiungi l'id della condition nell'array `conditions` del bioma:

```json
"mountain": {
  "label": "Montagne",
  "walkable": true,
  "resources": ["minerals"],
  "actions": ["cell-gather"],
  "conditions": ["freezing-wind"]
}
```

Un bioma può avere più conditions: `"conditions": ["freezing-wind", "ancient-knowledge"]`

---

## Tipi di effetto disponibili

### `hp-damage-percent-per-connected-cell`
Infligge danno HP a fine turno, proporzionale al numero di celle connesse del bioma.

```json
"effect": {
  "type": "hp-damage-percent-per-connected-cell",
  "basePercentPerConnectedCell": 0.03,
  "minDeltaHp": 1,
  "blockedByStatusKey": "nutrition"
}
```

| Campo | Note |
|---|---|
| `basePercentPerConnectedCell` | % degli HP massimi persa per ogni cella connessa |
| `minDeltaHp` | Danno minimo garantito (evita risultati a 0) |
| `blockedByStatusKey` | (opzionale) Status che annulla completamente il danno |

Esempio esistente: `hostile-environment` sul deserto

---

### `hp-heal-percent-per-connected-cell`
Guarisce HP a fine turno, proporzionalmente al numero di celle connesse.

```json
"effect": {
  "type": "hp-heal-percent-per-connected-cell",
  "basePercentPerConnectedCell": 0.03,
  "maxPercent": 0.15,
  "minDeltaHp": 1
}
```

| Campo | Note |
|---|---|
| `basePercentPerConnectedCell` | % degli HP massimi recuperati per ogni cella connessa |
| `maxPercent` | Tetto massimo di guarigione per turno (es. 0.15 = mai più del 15%) |
| `minDeltaHp` | Guarigione minima garantita |

Esempio esistente: `regenerating-waters` sull'acqua

---

### `resource-gain-multiplier`
Moltiplica le risorse guadagnate in questo bioma (raccolta, cell-gather, ecc.).

```json
"effect": {
  "type": "resource-gain-multiplier",
  "multiplier": 2,
  "resourceLabels": ["minerals"]
}
```

| Campo | Note |
|---|---|
| `multiplier` | Fattore moltiplicatore (2 = raddoppia) |
| `resourceLabels` | (opzionale) Lista risorse interessate. Se omesso, vale su tutte |

Esempi esistenti:
- `abundant-resources` — tutte le risorse x2
- `vein-of-plenty` — solo minerals x2

---

### `movement-enable-diagonal-adjacency`
Abilita il movimento diagonale da questa cella.

```json
"effect": {
  "type": "movement-enable-diagonal-adjacency"
}
```

Esempi esistenti: `open-ground`, `swift-path`

---

### `movement-block-entry`
Rende la cella non accessibile al player.

```json
"effect": {
  "type": "movement-block-entry"
}
```

Esempio esistente: `impassable`

---

### `experience-flat-on-turn-end`
Assegna XP fissi a fine turno, se il player è in questo bioma.

```json
"effect": {
  "type": "experience-flat-on-turn-end",
  "flatAmount": 2
}
```

Esempio esistente: `ancient-knowledge` (+2 XP a fine turno)

---

### `luck-check-multiplier`
Modifica il valore di fortuna usato nei check effettuati in questo bioma.

```json
"effect": {
  "type": "luck-check-multiplier",
  "luckDelta": -2
}
```

| Campo | Note |
|---|---|
| `luckDelta` | Negativo = penalizza la fortuna, positivo = la potenzia |

Esempio esistente: `cursed-ground` (-2 fortuna)

---

## Protezione via status (`blockedByStatusKey`)

Alcune conditions possono essere neutralizzate da uno status attivo sul player:

```json
"effect": {
  "type": "hp-damage-percent-per-connected-cell",
  "blockedByStatusKey": "nutrition"
}
```

Se il player ha lo status `nutrition` attivo, la condition non si applica per quel turno.
La key deve corrispondere a una entry in `statuses.config.json`.

---

## Conditions esistenti (riferimento)

| ID | Tipo effetto | Bioma assegnato | Note |
|---|---|---|---|
| `hostile-environment` | `hp-damage-percent-per-connected-cell` | desert | Bloccato da `nutrition` |
| `regenerating-waters` | `hp-heal-percent-per-connected-cell` | water | Max 15% HP per turno |
| `abundant-resources` | `resource-gain-multiplier` | — | Tutte le risorse x2 |
| `open-ground` | `movement-enable-diagonal-adjacency` | — | |
| `swift-path` | `movement-enable-diagonal-adjacency` | — | |
| `impassable` | `movement-block-entry` | — | |
| `vein-of-plenty` | `resource-gain-multiplier` | — | Solo minerals x2 |
| `ancient-knowledge` | `experience-flat-on-turn-end` | — | +2 XP a fine turno |
| `cursed-ground` | `luck-check-multiplier` | — | -2 fortuna |

---

## Quando serve uno sviluppatore

Se vuoi un tipo di effetto non in lista (es. "blocca l'uso degli spell in questo bioma", "riduce il movimento", ecc.) serve aggiungere il supporto in `src/app/services/gameplay/action-executor-service.ts`.

---

## Checklist

- [ ] Entry aggiunta nell'array `conditions` di `biome-conditions.config.json`
- [ ] `id` univoco e in kebab-case
- [ ] Il tipo di effetto (`effect.type`) è tra quelli supportati
- [ ] Se ha `blockedByStatusKey`: il valore esiste come `key` in `statuses.config.json`
- [ ] Condition assegnata al/ai biomi voluti in `tiles.config.json`
- [ ] Verifica in gioco: l'effetto si applica correttamente nel bioma
