# Guida: Oggetto (Item)

Gli oggetti vivono nell'inventario del player. Possono modificare parametri, sbloccare azioni specifiche, avere cariche con effetti attivi, o essere semplicemente oggetti di valore da rivendere.

---

## Basta il JSON?

**Sì**, se usi category, parameterModifiers e tipi di effetto già implementati.
**No (serve sviluppatore)**, se vuoi un comportamento completamente nuovo che non rientra in nessuno schema esistente.

---

## File da toccare

| File | Cosa scrivi |
|---|---|
| `public/configs/items.config.json` | Definisci l'oggetto nell'array `items` |
| `public/configs/item-effects.config.json` | (solo se ha effetti con cariche) Aggiungi gli effetti nell'array `effects` |
| `public/configs/merchant-stock/<mercante>.stock.json` | (opzionale) Rendi l'oggetto acquistabile |

---

## Schema completo

```json
{
  "id": "nome-item",
  "name": "Nome Visibile",
  "description": "Descrizione visibile al player.",
  "nameKey": "catalogs.items.nome-item.name",
  "descriptionKey": "catalogs.items.nome-item.description",
  "category": "weapon",
  "occupiesSpace": true,
  "consumable": false,
  "actions": [],
  "purchaseValue": 5,
  "maxCharges": 3,
  "effects": ["id-effetto-1"],
  "parameterModifiers": [
    { "parameter": "strength", "amount": 1, "scope": "always" }
  ],
  "constraints": {
    "allowedAlignments": ["good", "neutral", "evil"]
  }
}
```

| Campo | Obbligatorio | Note |
|---|---|---|
| `id` | sì | Univoco, kebab-case |
| `name` | sì | Nome di fallback (inglese) |
| `description` | sì | Descrizione di fallback |
| `nameKey` / `descriptionKey` | sì | Chiavi i18n; convenzione: `catalogs.items.<id>.name` |
| `category` | sì | Vedi categorie sotto |
| `occupiesSpace` | sì | `true` = occupa uno slot nell'inventario |
| `consumable` | sì | `true` = sparisce dopo l'uso |
| `actions` | sì | Azioni sbloccate da questo item (può essere `[]`) |
| `purchaseValue` | sì | Valore in monete (usato per la vendita; 0 = non vendibile) |
| `maxCharges` | no | Numero massimo di cariche (richiesto se ha `effects`) |
| `effects` | no | Array di id da `item-effects.config.json` |
| `parameterModifiers` | no | Modificatori ai parametri del player |
| `constraints` | no | Restrizioni (es. solo per certi allineamenti) |

---

## Categorie disponibili

| Categoria | Uso tipico |
|---|---|
| `weapon` | Armi che modificano la forza |
| `utility` | Strumenti con usi speciali o cariche |
| `valuable` | Oggetti senza effetti, da rivendere a prezzo alto |

---

## Modificatori ai parametri (`parameterModifiers`)

Attivi finché l'oggetto è nell'inventario del player.

```json
"parameterModifiers": [
  { "parameter": "strength", "amount": 1, "scope": "always" }
]
```

| Campo | Valori |
|---|---|
| `parameter` | `strength`, `magic`, `luck`, `movement` |
| `amount` | Numero intero (positivo = bonus, negativo = malus) |
| `scope` | `always` = sempre attivo; `fight-only` = solo in combattimento |

---

## Vincoli (`constraints`)

Limitano chi può usare o equipaggiare l'oggetto.

```json
"constraints": {
  "allowedAlignments": ["evil"]
}
```

Allineamenti disponibili: `good`, `neutral`, `evil`

---

## Azioni sbloccate (`actions`)

Alcuni oggetti abilitano azioni extra sulla mappa. Esempio: l'ascia sblocca `chop-tree` nelle foreste.

```json
"actions": ["chop-tree"]
```

L'id deve corrispondere a un'action già esistente in `actions.config.json`.

---

## Effetti con cariche (`effects` + `item-effects.config.json`)

Per oggetti che consumano e/o ricaricano cariche in base al bioma, a fine turno.

### Passo 1: aggiungi gli effetti in `item-effects.config.json`

```json
{
  "effects": [
    {
      "id": "mio-item-protezione",
      "label": "Desert protection",
      "description": "Consumes 1 charge at end of turn in desert to prevent hostile environment damage.",
      "type": "prevent-biome-condition-damage-by-charge",
      "biome": "desert",
      "conditionId": "hostile-environment",
      "consumeCharges": 1
    },
    {
      "id": "mio-item-ricarica",
      "label": "Water recharge",
      "description": "Recharges 1 charge at end of turn in water.",
      "type": "recharge-charges-in-biome",
      "biome": "water",
      "rechargeCharges": 1
    }
  ]
}
```

### Passo 2: collega gli effetti all'item in `items.config.json`

```json
"maxCharges": 3,
"effects": ["mio-item-protezione", "mio-item-ricarica"]
```

Nota: se l'item ha `effects`, imposta sempre anche `maxCharges`.

---

## Tipi di effetto disponibili (item-effects)

### `prevent-biome-condition-damage-by-charge`
Consuma cariche per bloccare il danno di una condition in un bioma specifico.

```json
{
  "id": "mio-id",
  "label": "Etichetta",
  "description": "Descrizione.",
  "type": "prevent-biome-condition-damage-by-charge",
  "biome": "desert",
  "conditionId": "hostile-environment",
  "consumeCharges": 1
}
```

| Campo extra | Note |
|---|---|
| `biome` | Bioma dove l'effetto si attiva (es. `desert`) |
| `conditionId` | Condition neutralizzata (es. `hostile-environment`) |
| `consumeCharges` | Cariche consumate ogni volta che si attiva |

---

### `recharge-charges-in-biome`
Ricarica cariche automaticamente quando il player finisce il turno in un certo bioma.

```json
{
  "id": "mio-id",
  "label": "Etichetta",
  "description": "Descrizione.",
  "type": "recharge-charges-in-biome",
  "biome": "water",
  "rechargeCharges": 1
}
```

| Campo extra | Note |
|---|---|
| `biome` | Bioma dove ricarica (es. `water`) |
| `rechargeCharges` | Cariche recuperate per turno |

---

## Vendita al mercante

Aggiungi l'item nel file di stock del mercante scelto:

```json
{
  "kind": "item",
  "tradableId": "nome-item",
  "stock": 3,
  "purchaseValue": 4
}
```

File disponibili: `public/configs/merchant-stock/city-merchant.stock.json`, `academy-merchant.stock.json`

---

## Esempi

### Spada incantata (weapon con bonus in combattimento)

```json
{
  "id": "enchanted-sword",
  "name": "Enchanted Sword",
  "description": "A blade imbued with magic. +2 Strength in combat.",
  "nameKey": "catalogs.items.enchanted-sword.name",
  "descriptionKey": "catalogs.items.enchanted-sword.description",
  "category": "weapon",
  "occupiesSpace": true,
  "consumable": false,
  "actions": [],
  "purchaseValue": 8,
  "parameterModifiers": [
    { "parameter": "strength", "amount": 2, "scope": "fight-only" }
  ]
}
```

### Reliquia di valore (nessun effetto, solo vendita)

```json
{
  "id": "golden-idol",
  "name": "Golden Idol",
  "description": "A rare artifact worth a fortune.",
  "nameKey": "catalogs.items.golden-idol.name",
  "descriptionKey": "catalogs.items.golden-idol.description",
  "category": "valuable",
  "occupiesSpace": false,
  "consumable": false,
  "actions": [],
  "purchaseValue": 15
}
```

### Borraccia (utility con cariche — esempio già presente nel gioco)

In `items.config.json`:
```json
{
  "id": "water-bottle",
  "name": "Water Bottle",
  "description": "A reusable bottle that stores water charges for harsh journeys.",
  "nameKey": "catalogs.items.water-bottle.name",
  "descriptionKey": "catalogs.items.water-bottle.description",
  "category": "utility",
  "occupiesSpace": true,
  "consumable": false,
  "actions": [],
  "purchaseValue": 4,
  "maxCharges": 3,
  "effects": ["water-bottle-desert-protection", "water-bottle-water-recharge"]
}
```

In `item-effects.config.json` (già presenti):
- `water-bottle-desert-protection` — consuma 1 carica nel deserto per bloccare `hostile-environment`
- `water-bottle-water-recharge` — ricarica 1 carica a fine turno sull'acqua

---

## Oggetti esistenti (riferimento)

| ID | Categoria | Effetto principale |
|---|---|---|
| `cursed-rune-sword` | weapon | +2 Strength (sempre); solo per allineamento `evil` |
| `common-sword` | weapon | +1 Strength (fight-only) |
| `common-axe` | weapon | +1 Strength (fight-only); sblocca `chop-tree` |
| `sealed-orb` | valuable | Nessun effetto; valore 8 monete |
| `water-bottle` | utility | 3 cariche; protegge dal deserto, ricarica sull'acqua |

---

## Checklist

- [ ] Entry aggiunta nell'array `items` di `items.config.json`
- [ ] `id` univoco e in kebab-case
- [ ] Se ha effetti con cariche: entries aggiunte in `item-effects.config.json` e `maxCharges` impostato
- [ ] Se sblocca azioni: gli id in `actions[]` esistono in `actions.config.json`
- [ ] Se ha vincoli: `constraints.allowedAlignments` impostato
- [ ] (opzionale) Aggiunto al file di stock del mercante
- [ ] Verifica in gioco: compare nell'inventario, parametri corretti, effetti funzionano, vendita funziona
