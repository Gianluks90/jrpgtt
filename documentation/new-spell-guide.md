# Guida: Incantesimo (Spell)

Gli incantesimi vivono nel libro degli incantesimi del player. Si lanciano durante il proprio turno spendendo MP.

Il libro ha una capacità massima (default: 4 slot). Ogni spell con `occupiesSlot: true` occupa uno slot.

---

## Basta il JSON?

**Sì**, se usi uno dei tipi di effetto già implementati (elencati sotto).
**No (serve sviluppatore)**, se vuoi un effetto completamente nuovo.

---

## File da toccare

| File | Cosa scrivi |
|---|---|
| `public/configs/spells.config.json` | Aggiungi lo spell nell'array `spells` |
| `public/configs/merchant-stock/<mercante>.stock.json` | (opzionale) Rendi lo spell acquistabile da un mercante |

---

## Schema completo

```json
{
  "id": "nome-spell",
  "mpCost": 3,
  "cooldownTurns": 1,
  "consumableOnCast": false,
  "occupiesSlot": true,
  "timing": "my-turn",
  "ui": {
    "name": "Nome Spell",
    "descriptionTemplate": "Descrizione visibile al player.",
    "i18n": {
      "nameKey": "spells.nomeSpell.name",
      "descriptionKey": "spells.nomeSpell.description"
    }
  },
  "effect": { ... },
  "acquisition": [ ... ]
}
```

| Campo | Obbligatorio | Note |
|---|---|---|
| `id` | sì | Univoco, kebab-case (es. `frost-bolt`) |
| `mpCost` | sì | MP spesi al lancio |
| `cooldownTurns` | sì | Turni di cooldown dopo il lancio (1 = riutilizzabile dal turno successivo) |
| `consumableOnCast` | sì | `true` = lo spell sparisce dopo il lancio |
| `occupiesSlot` | sì | `true` = occupa uno slot nel libro degli incantesimi |
| `timing` | sì | Sempre `"my-turn"` |
| `effect` | sì | Definisce cosa fa lo spell (vedi sezione sotto) |
| `acquisition` | no | Come/dove si ottiene lo spell |

---

## Tipi di effetto disponibili

### `enable-diagonal-movement`
Abilita il movimento diagonale per il turno corrente. Va lanciato **prima** di muoversi.

```json
"effect": {
  "type": "enable-diagonal-movement"
}
```

Esempio esistente: `fly` (Santuario del Vento)

---

### `apply-status-self`
Applica uno status al player che lancia lo spell.

```json
"effect": {
  "type": "apply-status-self",
  "statusKey": "nutrition",
  "baseDurationTurns": 1,
  "durationPerMagic": 0
}
```

| Campo | Note |
|---|---|
| `statusKey` | Deve corrispondere a una `key` in `statuses.config.json` |
| `baseDurationTurns` | Durata fissa in turni |
| `durationPerMagic` | Turni extra per ogni punto Magic del player (0 = durata fissa) |

Esempi esistenti:
- `healing-waters` applica `nutrition` (Santuario dell'Acqua)
- `inner-fire` applica `bravery` (Santuario del Fuoco)

---

### `heal-self`
Guarisce il player che lancia lo spell.

```json
"effect": {
  "type": "heal-self",
  "baseAmount": 0,
  "amountPerMagic": 1
}
```

| Campo | Note |
|---|---|
| `baseAmount` | HP fissi guariti |
| `amountPerMagic` | HP extra per ogni punto Magic del player |

Esempio esistente: `reinvigorate` guarisce HP pari al valore di Magic (Santuario della Terra)

---

## Come si ottiene lo spell (`acquisition`)

### Da un santuario (collegato a un elemento)
```json
"acquisition": [
  { "source": "sanctuary", "sanctuaryElement": "wind" }
]
```

Elementi disponibili: `water`, `fire`, `wind`, `earth`

Ogni santuario ha uno spell assegnato. Se ne assegni un secondo allo stesso elemento, solo uno sarà attivo.

### Da un mercante
Aggiungi al file di stock del mercante scelto:
```json
{
  "kind": "spell",
  "tradableId": "nome-spell",
  "stock": 2,
  "purchaseValue": 8
}
```

File disponibili: `public/configs/merchant-stock/city-merchant.stock.json`, `academy-merchant.stock.json`

---

## Spell esistenti (riferimento)

| ID | Effetto | Acquisizione |
|---|---|---|
| `fly` | Movimento diagonale per il turno | Santuario del Vento |
| `healing-waters` | Applica `nutrition` (1 turno) | Santuario dell'Acqua |
| `inner-fire` | Applica `bravery` (1 turno) | Santuario del Fuoco |
| `reinvigorate` | Guarisce HP pari a Magic | Santuario della Terra |

---

## Esempio completo: Bolt of Fortune

Uno spell che applica `fortune` per 1 turno, raddoppiando il bonus fortuna.

```json
{
  "id": "bolt-of-fortune",
  "mpCost": 2,
  "cooldownTurns": 2,
  "consumableOnCast": false,
  "occupiesSlot": true,
  "timing": "my-turn",
  "ui": {
    "name": "Bolt of Fortune",
    "descriptionTemplate": "Apply Fortune for 1 turn. Doubles luck bonus on checks.",
    "i18n": {
      "nameKey": "spells.boltOfFortune.name",
      "descriptionKey": "spells.boltOfFortune.description"
    }
  },
  "effect": {
    "type": "apply-status-self",
    "statusKey": "fortune",
    "baseDurationTurns": 1,
    "durationPerMagic": 0
  },
  "acquisition": [
    { "source": "sanctuary", "sanctuaryElement": "fire" }
  ]
}
```

---

## Checklist

- [ ] Entry aggiunta nell'array `spells` di `spells.config.json`
- [ ] `id` univoco e in kebab-case
- [ ] Se usi `apply-status-self`: il `statusKey` esiste in `statuses.config.json`
- [ ] Se usi acquisition via santuario: elemento è uno tra `water`, `fire`, `wind`, `earth`
- [ ] (opzionale) Aggiunto al file di stock del mercante
- [ ] Verifica in gioco: appare nel libro, si lancia correttamente, l'effetto funziona
