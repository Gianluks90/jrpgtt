# Guida: Seguace (Follower)

I seguaci accompagnano il player sulla mappa. Possono modificare parametri, aumentare la capacità dell'inventario o sbloccare azioni speciali.

---

## Basta il JSON?

**Sì**, per i casi standard: modificatori ai parametri, capacità inventario, azioni sbloccate.
**No (serve sviluppatore)**, se vuoi un comportamento completamente nuovo. Esempio: lo zombie che consuma 1 cibo ogni turno è implementato in codice, non solo in config.

---

## File da toccare

| File | Cosa scrivi |
|---|---|
| `public/configs/followers.config.json` | Aggiungi il seguace nell'array `followers` |
| `public/configs/merchant-stock/<mercante>.stock.json` | (opzionale) Rendi il seguace acquistabile |

---

## Schema completo

```json
{
  "id": "nome-follower",
  "name": "Nome",
  "description": "Descrizione visibile al player.",
  "nameKey": "catalogs.followers.nome-follower.name",
  "descriptionKey": "catalogs.followers.nome-follower.description",
  "category": "companion",
  "maxHp": 3,
  "actions": [],
  "itemCapacityBonus": 0,
  "parameterModifiers": [
    { "parameter": "strength", "amount": 1, "scope": "always" }
  ]
}
```

| Campo | Obbligatorio | Note |
|---|---|---|
| `id` | sì | Univoco, kebab-case |
| `name` | sì | Nome di fallback (inglese) |
| `description` | sì | Descrizione di fallback |
| `nameKey` / `descriptionKey` | sì | Chiavi i18n; convenzionalmente `catalogs.followers.<id>.name` |
| `category` | sì | `companion` oppure `undead` |
| `maxHp` | sì | HP massimi del seguace |
| `actions` | sì | Azioni speciali sbloccate (può essere `[]`) |
| `itemCapacityBonus` | no | Slot inventario extra forniti al player |
| `parameterModifiers` | no | Modificatori ai parametri del player |

---

## Categorie

| Categoria | Note |
|---|---|
| `companion` | Seguace standard |
| `undead` | Seguace non-morto (la logica speciale come il consumo di cibo è in codice) |

---

## Modificatori ai parametri (`parameterModifiers`)

Attivi finché il seguace è nel party del player.

```json
"parameterModifiers": [
  { "parameter": "magic", "amount": 2, "scope": "always" }
]
```

| Campo | Valori |
|---|---|
| `parameter` | `strength`, `magic`, `luck`, `movement` |
| `amount` | Numero intero (positivo = bonus, negativo = malus) |
| `scope` | `always` = sempre attivo; `fight-only` = solo in combattimento |

---

## Slot inventario extra (`itemCapacityBonus`)

```json
"itemCapacityBonus": 4
```

Aggiunge slot all'inventario del player finché il seguace è attivo.

---

## Azioni sbloccate (`actions`)

Alcune azioni di gioco richiedono un certo seguace nel party. Esempio: `feed-horse` è disponibile solo se hai il cavallo.

```json
"actions": ["feed-horse"]
```

L'id deve corrispondere a un'action già esistente in `actions.config.json`.

---

## Mettere il seguace in vendita

Nel file di stock del mercante scelto:

```json
{
  "kind": "follower",
  "tradableId": "nome-follower",
  "stock": 2,
  "purchaseValue": 10
}
```

File disponibili: `public/configs/merchant-stock/city-merchant.stock.json`, `academy-merchant.stock.json`

---

## Seguaci esistenti (riferimento)

| ID | Categoria | Effetto |
|---|---|---|
| `horse` | companion | Sblocca `feed-horse` → +1 movimento per quel turno |
| `princess` | companion | +1 Magic (sempre) |
| `mule` | companion | +4 slot inventario |
| `zombie` | undead | +1 Strength; consuma 1 cibo/turno o perde HP (logica in codice) |

---

## Esempio completo: Mago del Vento

Un seguace che potenzia la magia del player di 2 punti.

```json
{
  "id": "wind-mage",
  "name": "Wind Mage",
  "description": "A wandering mage who enhances your magical abilities. +2 Magic.",
  "nameKey": "catalogs.followers.wind-mage.name",
  "descriptionKey": "catalogs.followers.wind-mage.description",
  "category": "companion",
  "maxHp": 2,
  "actions": [],
  "parameterModifiers": [
    { "parameter": "magic", "amount": 2, "scope": "always" }
  ]
}
```

---

## Checklist

- [ ] Entry aggiunta nell'array `followers` di `followers.config.json`
- [ ] `id` univoco e in kebab-case
- [ ] Se sblocca azioni: gli id in `actions[]` esistono in `actions.config.json`
- [ ] (opzionale) Aggiunto al file di stock del mercante
- [ ] Verifica in gioco: il seguace compare nella lista, i parametri si aggiornano correttamente
