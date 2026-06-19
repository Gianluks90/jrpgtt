# Guida: Nemico (Enemy)

I nemici fanno parte del **Mazzo Esplorazione**. Quando un giocatore entra in una cella vuota e pesca un nemico, questo viene piazzato sulla cella e blocca l'esplorazione finché non viene sconfitto. Il nemico resta sulla cella anche se il giocatore fugge o pareggia, e diventa il "local event" per chiunque entri successivamente.

---

## Basta il JSON?

**Sì**, per definire un nuovo nemico con parametri, elemento, orario e bottino standard.  
**No (serve sviluppatore)**, se vuoi un `effect` con un comportamento completamente nuovo non ancora implementato.

---

## File da toccare

| File | Cosa scrivi |
|---|---|
| `public/configs/enemies.config.json` | Definisci il nemico nell'array `enemies` |
| `public/i18n/it.json` | Aggiungi nome e descrizione localizzati |

---

## Schema completo

```json
{
  "id": "forest-goblin",
  "name": "Forest Goblin",
  "nameKey": "catalogs.enemies.forest-goblin.name",
  "combatStat": "strength",
  "levelUpMode": "BestFirst",
  "time": "day",
  "element": "earth",
  "baseStrength": 4,
  "baseMagic": 3,
  "baseLuck": 1,
  "loot": ["exp", { "type": "gold", "dropRate": 0.75 }, { "type": "resource:timber", "dropRate": 0.40 }],
  "effect": null
}
```

| Campo | Obbligatorio | Note |
|---|---|---|
| `id` | sì | Univoco, kebab-case |
| `name` | sì | Nome di fallback (inglese) |
| `nameKey` | no | Chiave i18n per il nome localizzato |
| `combatStat` | sì | `strength` o `magic` — determina quale parametro del giocatore viene usato nello scontro |
| `levelUpMode` | sì | Come vengono distribuiti i punti al salire di livello. Vedi sezione dedicata. |
| `time` | sì | `day`, `night`, o `both` — il nemico è attivo in quel momento (+1 se attivo, -1 se orario opposto) |
| `element` | no | `fire`, `earth`, `wind`, `water`. Se assente, nessun modificatore elementale. |
| `baseStrength` | sì | Valore STR a livello 1 (range tipico: 3–5) |
| `baseMagic` | sì | Valore MAG a livello 1 (range tipico: 3–5) |
| `baseLuck` | sì | Valore LCK a livello 1 (range tipico: 1–3) |
| `loot` | no | Array di token bottino. Vedi sezione dedicata. |
| `effect` | no | Tag opaco per abilità passive future. Ometti o usa `null` se non serve. |

---

## Nota sui biomi

I nemici **non sono legati ai biomi**. Qualsiasi nemico può comparire su qualsiasi cella indipendentemente dal bioma. L'`element` (fire/earth/wind/water) è un meccanismo di combattimento, non una classificazione geografica.

---

## Livello e scaling

Il livello effettivo del nemico al momento dello spawn è: **colonna della cella ± 1** (casuale).  
Se la cella è colpita dal World Event con `worldEventEnemyLevelBonus`, si aggiunge +1 ulteriore.

Per ogni livello oltre il 1, il nemico guadagna **+1 punto** in un parametro, distribuito secondo `levelUpMode`:

| Modalità | Comportamento |
|---|---|
| `BestFirst` | Tutto in `combatStat` (il parametro usato nello scontro). Nemico specializzato. |
| `Equal` | Round-robin: STR → MAG → LCK → STR → ... a partire da `combatStat`. Crescita bilanciata. |
| `Lucky` | Tutto in LCK. Nemico imprevedibile: statistiche basse ma tiro fortuna potenzialmente alto. |

**Esempio:** Goblin con `baseStrength: 4`, `combatStat: "strength"`, `levelUpMode: "BestFirst"`, livello 3:
- STR = 4 + 2 = **6**, MAG = 3, LCK = 1

---

## Parametro di combattimento (`combatStat`)

Determina quale parametro del **giocatore** viene confrontato col nemico:

- `strength` → il giocatore usa la sua FOR, il nemico usa la sua STR
- `magic` → il giocatore usa la sua MAG, il nemico usa la sua MAG

Il nemico usa sempre il parametro corrispondente al proprio `combatStat`, indipendentemente dal tipo.

---

## Elemento (`element`)

Ciclo: **Fuoco > Terra > Vento > Acqua > Fuoco**

Il tuo elemento batte quello del nemico → **+1** al tuo totale finale.  
Il suo elemento batte il tuo → **+1** al totale del nemico.  
Nessun elemento = nessun modificatore.

Il giocatore ottiene un elemento attunandosi a un santuario. Combattere nel quadrante del proprio santuario garantisce **+1** aggiuntivo, indipendentemente dall'elemento del nemico.

---

## Orario (`time`)

| Valore | Effetto |
|---|---|
| `day` | +1 al totale del nemico di giorno; -1 di notte |
| `night` | +1 al totale del nemico di notte; -1 di giorno |
| `both` | Nessun modificatore orario |

---

## Bottino (`loot`)

Il campo `loot` è un array di **token**. Ogni token descrive una ricompensa che il giocatore può ottenere in caso di vittoria.

Esistono due formati di token:

**Stringa pura** — drop garantito (sempre assegnato):
```json
"exp"
```

**Oggetto con drop rate** — drop probabilistico, modificato dalla Fortuna del giocatore:
```json
{ "type": "gold", "dropRate": 0.75 }
```

### Formula drop

```
tasso_effettivo = min(dropRate + LCK × 0.03, 0.97)
```

Ogni punto di Fortuna vale **+3%** di probabilità. Il cap è 97% (nessun drop è mai garantito al 100% se ha un dropRate).

**Esempi pratici:**

| LCK | dropRate 0.40 (risorsa) | dropRate 0.75 (oro) |
|---|---|---|
| 1 | 43% | 78% |
| 3 | 49% | 84% |
| 5 | 55% | 90% |
| 8 | 64% | 97% (cap) |

### Token disponibili

| Tipo | Formato | Drop rate consigliato | Effetto |
|---|---|---|---|
| Esperienza | `"exp"` (stringa) | garantito | XP in base alla regione: I → 1, II → 2, III → 3 |
| Oro | `{ "type": "gold", "dropRate": 0.75 }` | 0.70–0.80 | Monete: **2 × colonna** della cella |
| Risorsa | `{ "type": "resource:food", "dropRate": 0.40 }` | 0.35–0.50 | 1 unità. ID validi: `food`, `timber`, `minerals`, `cloth` |
| Oggetto | `{ "type": "item:<id>", "dropRate": 0.20 }` | 0.10–0.30 | Fa cadere una carta oggetto sulla cella |
| Magia | `{ "type": "magic:<id>", "dropRate": 0.15 }` | 0.10–0.20 | Fa cadere una carta magia sulla cella |

### Note

- Se `loot` è assente o vuoto, la vittoria non assegna nessuna ricompensa.
- `"exp"` va sempre lasciato come stringa (drop garantito — il giocatore vince sempre XP).
- I token `item:` e `magic:` referenziano ID dei rispettivi cataloghi.
- Un nemico può mescolare token garantiti e probabilistici nello stesso array.

### Esempi

```json
"loot": ["exp"]
// solo esperienza garantita

"loot": ["exp", { "type": "gold", "dropRate": 0.75 }]
// esperienza garantita + oro al 75%

"loot": ["exp", { "type": "resource:food", "dropRate": 0.40 }]
// esperienza garantita + cibo al 40%

"loot": ["exp", { "type": "gold", "dropRate": 0.75 }, { "type": "resource:timber", "dropRate": 0.40 }]
// esperienza garantita + oro al 75% + legname al 40%

"loot": ["exp", { "type": "item:rusty-sword", "dropRate": 0.20 }]
// esperienza garantita + spada arrugginita al 20%
```

---

## Localizzazione

In `public/i18n/it.json`, aggiungi sotto la chiave `catalogs.enemies`:

```json
"catalogs": {
  "enemies": {
    "forest-goblin": {
      "name": "Goblin della Foresta",
      "description": "Una piccola creatura aggressiva che difende il suo territorio."
    }
  }
}
```

---

## Formula di combattimento (riferimento rapido)

```
Totale = baseStat(combatStat) + luckBonus(LCK) ± elementModifier ± timeModifier
```

- **luckBonus**: tiro 1–100, aggiunge LCK, si divide per 10 → bonus 1–10
- **Critico**: tiro esatto 100 (prima di aggiungere LCK) → vittoria automatica, danno massimo
- **Autowin**: se la differenza nei valori base supera 10, il dado non cambia l'esito
- **Danno** = differenza tra i totali finali, sottratta agli HP del perdente
- **Pareggio**: il nemico non viene sconfitto e resta sulla cella

---

## Esempi

### Goblin di foresta (corpo a corpo, diurno)

```json
{
  "id": "forest-goblin",
  "name": "Forest Goblin",
  "combatStat": "strength",
  "levelUpMode": "BestFirst",
  "time": "day",
  "element": "earth",
  "baseStrength": 4,
  "baseMagic": 3,
  "baseLuck": 1,
  "loot": ["exp", { "type": "gold", "dropRate": 0.75 }, { "type": "resource:timber", "dropRate": 0.40 }]
}
```

### Spettro delle rovine (magia, notturno)

```json
{
  "id": "ruins-specter",
  "name": "Ruins Specter",
  "combatStat": "magic",
  "levelUpMode": "Equal",
  "time": "night",
  "element": "wind",
  "baseStrength": 3,
  "baseMagic": 5,
  "baseLuck": 2,
  "loot": ["exp", { "type": "gold", "dropRate": 0.75 }, { "type": "resource:minerals", "dropRate": 0.40 }]
}
```

### Ratto fortunato (debole ma imprevedibile)

```json
{
  "id": "lucky-rat",
  "name": "Lucky Rat",
  "combatStat": "strength",
  "levelUpMode": "Lucky",
  "time": "both",
  "baseStrength": 3,
  "baseMagic": 3,
  "baseLuck": 3,
  "loot": ["exp"]
}
```

### Nemico raro con drop oggetto

```json
{
  "id": "ancient-guardian",
  "name": "Ancient Guardian",
  "combatStat": "strength",
  "levelUpMode": "Equal",
  "time": "both",
  "element": "earth",
  "baseStrength": 6,
  "baseMagic": 4,
  "baseLuck": 2,
  "loot": ["exp", { "type": "gold", "dropRate": 0.75 }, { "type": "item:ancient-relic", "dropRate": 0.20 }]
}
```

---

## Checklist

- [ ] Entry aggiunta nell'array `enemies` di `enemies.config.json`
- [ ] `id` univoco e in kebab-case
- [ ] `combatStat` impostato (`strength` o `magic`)
- [ ] `levelUpMode` impostato (`BestFirst`, `Equal`, o `Lucky`)
- [ ] `time` impostato (`day`, `night`, o `both`)
- [ ] Valori base coerenti (STR/MAG 3–5, LCK 1–3 per livello 1)
- [ ] `loot` definito come array di token (o omesso se nessuna ricompensa)
- [ ] Nessun campo bioma aggiunto (i nemici sono spawn-agnostici rispetto al bioma)
- [ ] Localizzazione aggiunta in `it.json` sotto `catalogs.enemies.<id>`
- [ ] Verifica in gioco: il nemico compare sulla cella, i parametri scalano correttamente con il livello, il bottino viene assegnato dopo la vittoria
