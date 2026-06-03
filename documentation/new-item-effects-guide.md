# Item Effects Guide

Guida pratica per creare oggetti combinando effetti configurabili, senza scrivere nuova logica gameplay ogni volta.

Obiettivo: arrivare a costruire i nuovi item quasi solo da JSON.

---

## 1. Flusso reale (config -> runtime)

Quando un item deve applicare un effetto:

1. `public/configs/items.config.json`
2. `public/configs/item-effects.config.json`
3. `src/app/services/item-catalog-service.ts`
4. `src/app/services/item-effect-catalog-service.ts`
5. `src/app/services/action-executor-service.ts` (trigger: fine turno)

Sintesi:
- `items.config.json` definisce quali effects ha ogni item
- `item-effects.config.json` definisce il comportamento di ogni effect
- executor applica gli effects in modo autoritativo in transaction

---

## 2. Contratto item

In `items.config.json`, un item puo usare:

- `maxCharges` (opzionale): cariche massime dell item
- `effects` (opzionale): array di effect id

Esempio base:

```json
{
  "id": "water-bottle",
  "name": "Water Bottle",
  "description": "A reusable bottle that stores water charges for harsh journeys.",
  "category": "utility",
  "occupiesSpace": true,
  "consumable": false,
  "actions": [],
  "purchaseValue": 4,
  "maxCharges": 3,
  "effects": [
    "water-bottle-desert-protection",
    "water-bottle-water-recharge"
  ]
}
```

Nota:
- se un item ha effects che consumano/ricaricano cariche, imposta sempre `maxCharges`

---

## 3. Catalogo effects

In `item-effects.config.json` il root e:

```json
{
  "effects": []
}
```

Ogni effect richiede:
- `id`
- `label`
- `type`
- `biome`

### 3.1 Type disponibili (MVP)

1. `prevent-biome-condition-damage-by-charge`
- previene il danno di una condition sul biome, consumando cariche
- campi extra:
  - `conditionId`
  - `consumeCharges`

2. `recharge-charges-in-biome`
- ricarica cariche quando sei in un certo biome a fine turno
- campi extra:
  - `rechargeCharges`

---

## 4. Template copia/incolla

### 4.1 Protezione condizione con consumo cariche

```json
{
  "id": "my-item-desert-protection",
  "label": "Desert protection",
  "description": "Consumes charges to prevent hostile environment damage.",
  "type": "prevent-biome-condition-damage-by-charge",
  "biome": "desert",
  "conditionId": "hostile-environment",
  "consumeCharges": 1
}
```

### 4.2 Ricarica cariche in biome

```json
{
  "id": "my-item-water-recharge",
  "label": "Water recharge",
  "description": "Recharges charges in water.",
  "type": "recharge-charges-in-biome",
  "biome": "water",
  "rechargeCharges": 1
}
```

---

## 5. Esempio completo (Water Bottle)

In `item-effects.config.json`:

```json
{
  "id": "water-bottle-desert-protection",
  "label": "Desert protection",
  "description": "Consumes 1 charge at end of turn in desert to prevent hostile environment damage.",
  "type": "prevent-biome-condition-damage-by-charge",
  "biome": "desert",
  "conditionId": "hostile-environment",
  "consumeCharges": 1
}
```

```json
{
  "id": "water-bottle-water-recharge",
  "label": "Water recharge",
  "description": "Recharges 1 charge at end of turn in water.",
  "type": "recharge-charges-in-biome",
  "biome": "water",
  "rechargeCharges": 1
}
```

In `items.config.json`:

```json
"effects": [
  "water-bottle-desert-protection",
  "water-bottle-water-recharge"
]
```

---

## 6. Checklist rapida nuovo item

1. Crea gli effects in `item-effects.config.json`
2. Aggiungi l item in `items.config.json` con `effects` e (se serve) `maxCharges`
3. Se vuoi venderlo: aggiungi stock mercante in `public/configs/merchant-stock/*.json`
4. Build: `npm run build`
5. Verifica in gioco:
- consumo cariche nel biome corretto
- ricarica nel biome corretto
- UI utilizzi (`current/max` + quadratini)

---

## 7. Regole di design consigliate

1. Riusa effect id esistenti quando possibile
2. Crea un nuovo effect type solo se riusabile su piu item
3. Mantieni effects atomici (una responsabilita ciascuno)
4. Preferisci composizione di 2-3 effects invece di uno monolitico

---

## 8. Limiti attuali del MVP

Attualmente il trigger implementato e la fine turno (`endTurn`).

Estensioni naturali future:
- trigger su movimento (`on-enter-biome`)
- trigger su action (`on-action-executed`)
- effetti passivi permanenti (`passive`)

Queste estensioni possono essere aggiunte senza cambiare il modello di composizione item.
