# Guida alla composizione dei mazzi di esplorazione

Il sistema di esplorazione si basa su mazzi di carte fisiche che vengono pescate e mischiate automaticamente. Ogni carta esiste in un unico catalogo nativo; il mazzo esplorazione è semplicemente un elenco di riferimenti a quelle carte con le quantità.

---

## Concetto chiave: carte fisiche vs definizioni

Come in un vero gioco da tavolo, le carte esistono una volta sola nei loro cataloghi:
- **Nemici** → enemy catalog (`/configs/enemies.config.json` o simile)
- **Oggetti** → item catalog
- **Seguaci** → follower catalog
- **Eventi, Luoghi, Stranieri** → `exploration-cards-catalog.ts` (tipi esclusivi dell'esplorazione)

Il deck config dice solo "metti X copie di questa carta nel mazzo". Il sistema espande le quantità in slot fisici, ognuno con un `instanceId` univoco.

---

## Struttura dati

### `ExplorationDeckEntry` — riga nel deck config

```ts
{
  type: ExplorationCardType;   // 'enemy' | 'item' | 'follower' | 'event' | 'place' | 'stranger' | 'amulet'
  cardId: string;              // id nel catalogo nativo del tipo
  quantity: number;            // copie fisiche nel mazzo
  expansion: string;           // 'base', 'dungeon', ecc.
  forced?: boolean;            // solo follower: si unisce automaticamente
}
```

### `ExplorationDeckSlot` — slot fisico nel mazzo mescolato

Uguale all'entry ma senza `quantity` (già espanso). È l'oggetto salvato in Firestore:

```ts
// worldState.explorationDeck: ExplorationDeckSlot[]
{ type: 'enemy', cardId: 'forest-goblin', expansion: 'base' }
{ type: 'item',  cardId: 'common-sword',  expansion: 'base' }
```

### `PlacedExplorationCard` — carta istanziata sulla mappa

Quando uno slot viene pescato, il sistema crea una carta con `instanceId` univoco:

```ts
// quantity: 3 → 3 slot con cardId identico, ma instanceId diverso
{ type: 'enemy', cardId: 'forest-goblin', instanceId: 'uuid-1', expansion: 'base', ... }
{ type: 'enemy', cardId: 'forest-goblin', instanceId: 'uuid-2', expansion: 'base', ... }
{ type: 'enemy', cardId: 'forest-goblin', instanceId: 'uuid-3', expansion: 'base', ... }
```

---

## Il mazzo base

Definito in `src/app/consts/catalog/exploration-deck-config.ts`:

```ts
export const EXPLORATION_BASE_DECK: ExplorationDeckConfig = {
    id: 'base',
    label: 'Base Set',
    cards: [
        { type: 'enemy',    cardId: 'forest-goblin',            quantity: 1, expansion: 'base' },
        { type: 'event',    cardId: 'event-sudden-storm',        quantity: 1, expansion: 'base' },
        { type: 'place',    cardId: 'place-abandoned-camp',      quantity: 1, expansion: 'base' },
        { type: 'stranger', cardId: 'stranger-wandering-healer', quantity: 1, expansion: 'base' },
        { type: 'follower', cardId: 'horse',                     quantity: 1, expansion: 'base', forced: false },
        { type: 'item',     cardId: 'common-sword',              quantity: 1, expansion: 'base' },
        { type: 'amulet',   cardId: 'talisman',                  quantity: 1, expansion: 'base' },
    ],
};
```

---

## Come aggiungere nuove carte

### Nemici, oggetti, seguaci, amuleti

Queste carte **non vanno definite** nel catalogo esplorazione — esistono già nei loro cataloghi nativi. Aggiungi solo una riga al deck config:

```ts
// nuovo nemico già presente nel catalogo nemici come 'cave-troll'
{ type: 'enemy', cardId: 'cave-troll', quantity: 2, expansion: 'base' }

// nuovo oggetto già presente nel catalogo oggetti come 'iron-shield'
{ type: 'item', cardId: 'iron-shield', quantity: 3, expansion: 'base' }

// seguace forzato (si unisce automaticamente)
{ type: 'follower', cardId: 'loyal-dog', quantity: 1, expansion: 'base', forced: true }
```

### Eventi, luoghi, stranieri

Questi tipi **sono esclusivi dell'esplorazione** e vanno definiti in `src/app/consts/catalog/exploration-cards-catalog.ts`, poi referenziati nel deck config.

**Aggiungere un evento:**

```ts
// 1. In exploration-cards-catalog.ts
events: [
    {
        type: 'event',
        id: 'event-cursed-spring',
        name: 'Fonte Maledetta',
        description: 'Bevi ingenuamente da una fonte avvelenata. Perdi 2 PF.',
        duration: 'instant',
        effect: { type: 'lose-hp', amount: 2 },
    },
],

// 2. In exploration-deck-config.ts
{ type: 'event', cardId: 'event-cursed-spring', quantity: 2, expansion: 'base' }
```

**Aggiungere uno straniero:**

```ts
// 1. In exploration-cards-catalog.ts
strangers: [
    {
        type: 'stranger',
        id: 'stranger-merchant',
        name: 'Mercante Ambulante',
        description: 'Un mercante offre la sua merce al giusto prezzo.',
        persistent: true,            // rimane sulla cella dopo la visita
        dialogType: 'merchant',
        dialogParams: { stock: ['common-sword', 'iron-shield'] },
    },
],

// 2. In exploration-deck-config.ts
{ type: 'stranger', cardId: 'stranger-merchant', quantity: 1, expansion: 'base' }
```

**Tipi di effetto evento disponibili:**

| Tipo | Descrizione |
|---|---|
| `lose-hp` | Perde `amount` PF |
| `gain-hp` | Recupera `amount` PF (max) |
| `lose-gold` | Perde `amount` monete |
| `gain-gold` | Guadagna `amount` monete |
| `none` | Solo narrativo |

**Tipi di dialogo straniero disponibili:**

| `dialogType` | Parametri | Stato |
|---|---|---|
| `healer` | `healAmount: number`, `cost: number` | Implementato |
| `merchant` | TBD | Da implementare |
| `mercenary` | TBD | Da implementare |

---

## Come creare un'espansione

Crea una nuova config e aggiungila all'array `EXPLORATION_DECK_CONFIGS`:

```ts
export const EXPLORATION_DUNGEON_DECK: ExplorationDeckConfig = {
    id: 'dungeon',
    label: 'Dungeon Expansion',
    cards: [
        { type: 'enemy',  cardId: 'cave-troll',        quantity: 2, expansion: 'dungeon' },
        { type: 'event',  cardId: 'event-cave-in',     quantity: 1, expansion: 'dungeon' },
        { type: 'item',   cardId: 'torch',              quantity: 3, expansion: 'dungeon' },
    ],
};

export const EXPLORATION_DECK_CONFIGS: ExplorationDeckConfig[] = [
    EXPLORATION_BASE_DECK,
    EXPLORATION_DUNGEON_DECK,  // attivato per tutte le partite
];
```

Il campo `expansion` su ogni slot permette in futuro di filtrare i mazzi per setup custom della partita (es. "abilita solo base" o "base + dungeon").

---

## Meccaniche di pesca e rimescolamento

- **Pesca:** ogni volta che un giocatore sbarca su una cella normale senza eventi, viene pescato uno slot dal mazzo.
- **Rimescolamento mid-draw:** se il mazzo si svuota durante la pesca, il discard viene rimescolato on-the-fly per completare il draw.
- **Eager reshuffle:** dopo la pesca, se il mazzo è vuoto e ci sono scarti, vengono rimescolati immediatamente — la carta appena pescata non è ancora negli scarti, quindi non può ricomparire nella stessa tornata.
- **Pila degli scarti (display):** ogni carta risolta scrive un `DiscardPileEntry` nella subcollection Firestore `discardPile`, visibile ai giocatori. Il `cardId` + `type` nello slot sono sufficienti a ricostruire nome e dettagli dal catalogo.
- **Oggetti e seguaci raccolti** non vanno agli scarti — vanno nell'inventario. Finiscono negli scarti solo se persi/morti (futuro).

---

## Riferimenti al codice

| File | Responsabilità |
|---|---|
| `src/app/consts/catalog/exploration-cards-catalog.ts` | Definizioni eventi, luoghi, stranieri |
| `src/app/consts/catalog/exploration-deck-config.ts` | Configurazioni mazzi attivi |
| `src/app/models/catalog/ExplorationCardCatalog.ts` | Interfacce: `ExplorationDeckEntry`, `ExplorationDeckSlot`, `ExplorationDeckConfig` |
| `src/app/models/exploration/ExplorationCard.ts` | Interfacce placed card (con `expansion`) |
| `src/app/services/catalog/exploration-catalog-service.ts` | Lookup eventi/luoghi/stranieri + `instantiatePlacedCard` |
| `src/app/services/exploration/exploration-deck-service.ts` | Build, shuffle, draw, eager reshuffle |
| `src/app/services/exploration/exploration-event-service.ts` | Flusso di risoluzione per ogni carta |
| `src/app/services/exploration/exploration-action-service.ts` | Scritture Firestore (pickup, combat commit, discard) |
