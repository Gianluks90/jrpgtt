# Guida: Punto di interesse (Landmark)

I landmark sono luoghi speciali sulla mappa: Capital, City, Castle, Dungeon, Altar, ecc. Appaiono automaticamente durante la generazione della mappa e offrono azioni specifiche al player.

---

## Basta il JSON?

**Sì**, per aggiungere un nuovo tipo di landmark con azioni già esistenti.
**No (serve sviluppatore)**, se vuoi una categoria completamente nuova o comportamenti speciali mai visti nel gioco.

---

## File da toccare

| File | Cosa scrivi |
|---|---|
| `public/configs/landmarks.config.json` | Definizione del landmark + azioni associate |

---

## Le tre categorie

| Categoria | Comportamento tipico | Esempi esistenti |
|---|---|---|
| `safe` | Luogo sicuro con servizi (dottore, mercante, riposo) | Capital, City, Village, Camp |
| `mid` | Luogo neutro, può avere modificatore di allineamento | Castle, Academy, Temple, Graveyard |
| `bad` | Luogo pericoloso o oscuro | Cave, Dungeon, Manor, Altar |

---

## Aggiungere un landmark

### Passo 1: definizione nell'array `definitions`

```json
{ "id": "fortress", "baseName": "Fortress", "category": "mid", "usesAlignmentModifier": true }
```

| Campo | Note |
|---|---|
| `id` | Univoco, kebab-case |
| `baseName` | Nome base in inglese (fallback) |
| `category` | `safe`, `mid`, oppure `bad` |
| `usesAlignmentModifier` | `true` = il nome riceve prefisso (`Blessed Fortress` / `Cursed Fortress`) |

### Passo 2: azioni nella sezione di placement corretta

Scegli la sezione in base alla categoria:

**Per categoria `safe` → `safePlaceActionsByLandmark`:**
```json
"safePlaceActionsByLandmark": {
  "fortress": ["safe-place-wait", "fast-travel", "castle-trainer"]
}
```

**Per categoria `mid` → `midPlaceActionsByLandmark`:**
```json
"midPlaceActionsByLandmark": {
  "fortress": ["castle-rest", "castle-trainer"]
}
```

**Per categoria `bad` → `badPlaceActionsByLandmark`:**
```json
"badPlaceActionsByLandmark": {
  "fortress": []
}
```

Gli id delle azioni devono esistere in `actions.config.json`.

---

## Azioni disponibili per landmark

### Per landmark `safe`

| Azione | Cosa fa |
|---|---|
| `safe-place-wait` | Aspetta sul posto (simula movimento sulla stessa cella, fine turno) |
| `fast-travel` | Prenota viaggio rapido verso altro safe place |
| `capital-doctor` | Cura HP a pagamento (Capital) |
| `city-healer` | Cura HP a pagamento (City) |
| `capital-enchantress` | Premio magico variabile |
| `capital-inn` | Riposo (HP + fine turno) |
| `city-mystic` | Carta destino con effetti variabili |
| `city-merchant` | Compra e vendi oggetti |
| `village-craftsman` | Scambia risorse con il fabbro |
| `camp-gatherer` | Ottieni risorse raccogliendo dal campo |
| `camp-hunter` | Ottieni risorse cacciando dal campo |

### Per landmark `mid`

| Azione | Cosa fa |
|---|---|
| `graveyard-resurrect` | Tenta di resuscitare un seguace morto |
| `temple-send-devotee` | Invia un devoto (diventa GOOD, ottieni XP) |
| `castle-rest` | Riposo nel castello |
| `castle-trainer` | Allena un parametro a pagamento (Castle) |
| `academy-trainer` | Allena un parametro a pagamento (Academy) |
| `academy-merchant` | Compra e vendi oggetti |
| `altar-sacrifice` | Sacrificio (diventa EVIL, ottieni XP) |

### Per landmark `bad`

Attualmente i landmark bad hanno poche azioni. L'unica attiva è:

| Azione | Cosa fa |
|---|---|
| `altar-sacrifice` | Sacrificio (solo per Altar) |

---

## Come i landmark appaiono sulla mappa

I landmark vengono posizionati automaticamente durante la generazione della mappa. Non puoi controllare dove appare un landmark dalla sua config: puoi solo definire cosa offre al player quando ci arriva.

### Prefissi di allineamento (solo per `mid` con `usesAlignmentModifier: true`)
I landmark `mid` ricevono un prefisso basato sull'allineamento generato:

| Allineamento | Prefisso |
|---|---|
| `good` | `Blessed` |
| `neutral` | (nessun prefisso) |
| `evil` | `Cursed` |

La distribuzione degli allineamenti è definita in `midAlignmentDistribution`.

---

## Landmark esistenti (riferimento)

| ID | Categoria | Modifier | Azioni principali |
|---|---|---|---|
| `capital` | safe | no | doctor, enchantress, inn, wait, fast-travel |
| `city` | safe | no | healer, mystic, merchant, wait, fast-travel |
| `village` | safe | no | craftsman, wait, fast-travel |
| `camp` | safe | no | gatherer, hunter, wait, fast-travel |
| `graveyard` | mid | sì | resurrect |
| `temple` | mid | sì | send-devotee |
| `castle` | mid | sì | rest, trainer |
| `academy` | mid | sì | merchant, trainer |
| `cave` | bad | no | (nessuna) |
| `dungeon` | bad | no | (nessuna) |
| `manor` | bad | no | (nessuna) |
| `altar` | bad | no | sacrifice |

---

## Esempio completo: Fortezza

Una fortezza di categoria `mid` con prefisso di allineamento, che offre riposo e allenamento.

```json
// Nell'array definitions:
{ "id": "fortress", "baseName": "Fortress", "category": "mid", "usesAlignmentModifier": true }

// In midPlaceActionsByLandmark:
"fortress": ["castle-rest", "castle-trainer"]
```

Risultato sulla mappa: appare come `Fortress`, `Blessed Fortress`, o `Cursed Fortress` a seconda dell'allineamento.

---

## Checklist

- [ ] Entry aggiunta nell'array `definitions`
- [ ] `id` univoco e in kebab-case
- [ ] Sezione di placement aggiornata (safe / mid / bad)
- [ ] Tutte le azioni referenziate esistono in `actions.config.json`
- [ ] Verifica in gioco: il landmark appare sulla mappa, le azioni sono disponibili
