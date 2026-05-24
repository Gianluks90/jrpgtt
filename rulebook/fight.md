# LIBRETTO DI COMBATTIMENTO

## Visione Generale
Il sistema di combattimento e` pensato per essere rapido da capire, ma profondo da padroneggiare.

- Ogni scontro inizia e finisce in una singola risoluzione.
- Il livello del nemico e` visibile prima dell’ingaggio.
- Le colonne della mappa indicano il rischio atteso: nemici di livello pari alla colonna, con variabilita` +-1.
- Le sintonie elementali influenzano l’esito in modo chiaro.
- Alcuni nemici possono avere modificatori casuali che li rendono unici.

Obiettivo: dare al giocatore informazioni sufficienti per scegliere se rischiare, aggirare o prepararsi.

## Flusso dello Scontro
1. Inizio incontro.
2. Il gioco mostra:
- Livello del nemico
- Elemento dominante del nemico
- Eventuali modificatori casuali del nemico
3. Il giocatore sceglie il tipo di attacco:
- Fisico (Strength)
- Magico (Magic)
4. Entrambe le parti tirano 1d6.
5. Si calcola il Punteggio di Battaglia per entrambi.
6. Si confrontano i punteggi.
7. Il perdente subisce danno in base alla differenza.
8. Fine scontro.

## Punteggio di Battaglia
Punteggio di Battaglia = Stat principale + Bonus Livello + Tiro d6 + Bonus Elementale + Bonus Fortuna + Modificatori speciali

Dove:
- Stat principale: Strength o Magic (in base all’attacco scelto).
- Bonus Livello: scaling morbido, rende i nemici alti davvero pericolosi ma non ingestibili.
- Bonus Elementale: vantaggio/svantaggio dalla ruota elementale.
- Bonus Fortuna: piccolo bonus che rende meno piatti gli esiti.
- Modificatori speciali: tratti casuali del nemico.

## Scaling del Livello (consigliato)
Per avere crescita JRPG senza picchi eccessivi:

Bonus Livello = livello del contendente - 1

Esempi:
- Livello 1: +0
- Livello 2: +1
- Livello 5: +4
- Livello 8: +7

Questo tiene i primi livelli accessibili e rende minacciosi i livelli alti.

## Danno Basato su Differenza (non fisso)
Danno subito = BaseDanno + (Differenza x Fattore)

Valori consigliati:
- BaseDanno = 4
- Fattore = 2
- Cap massimo = 28

Quindi:
- Differenza 1: 6 danni
- Differenza 3: 10 danni
- Differenza 6: 16 danni
- Differenza 12: 28 danni (cap)

Nota: con HP massimi a 100, il danno cresce bene con il livello ma non esplode ai primi incontri.

## Ruota delle Affinita` Elementali
Ordine circolare:
- Fuoco > Terra > Aria > Acqua > Fuoco

Regole:
- In vantaggio: +2 Punteggio di Battaglia
- In svantaggio: -2 Punteggio di Battaglia
- Stesso elemento o nessun elemento: 0

Se il giocatore non e` sintonizzato, combatte sempre in neutro.

## Fortuna
Bonus Fortuna consigliato:
- Bonus Fortuna = floor(Luck / 2), massimo +3

Opzione avanzata (facoltativa):
- Una volta per scontro, il giocatore puo` spendere 1 Punto Fortuna per ritirare il proprio d6.

## Modificatori Casuali del Nemico
I modificatori servono a rendere memorabili gli incontri e a tenere alta la tensione.

Esempi:
- Furioso: +2 Strength
- Arcano: +2 Magic
- Corazzato: riduce il danno subito di 3 (minimo 1)
- Predatore: +2 se in vantaggio elementale
- Instabile: +3 al d6 massimo, ma -2 fisso al Punteggio

Regola di bilanciamento consigliata:
- Nemici di livello 1-2: massimo 1 modificatore leggero
- Nemici di livello 3+: 1 modificatore standard
- Elite/Boss: 2 modificatori

## Mappa e Rischio Percepito
Distribuzione consigliata per colonna:
- Livello nemico atteso = numero colonna
- Variazione casuale: -1, 0, +1
- Limite minimo: livello 1

Il giocatore sa sempre in anticipo il livello nemico e puo` scegliere con cautela il percorso.

## Esempi di Combattimento

### Esempio 1: Incontro iniziale (basso rischio)
- Player livello 1: Strength 3, Luck 1, nessun elemento
- Nemico livello 1: Strength 2, elemento Terra
- Attacco scelto: fisico
- Tiri: player 4, nemico 3

Punteggio player:
- 3 (Strength) + 0 (Bonus Livello) + 4 (d6) + 0 (elemento) + 0 (fortuna) = 7

Punteggio nemico:
- 2 (Strength) + 0 (Bonus Livello) + 3 (d6) + 0 (elemento) + 0 (fortuna) = 5

Differenza = 2
Danno al nemico = 4 + (2 x 2) = 8

### Esempio 2: Incontro avanzato con svantaggio elementale
- Player livello 4: Magic 6, Luck 4, elemento Fuoco
- Nemico livello 5: Magic 7, elemento Acqua
- Relazione elementale: Fuoco in svantaggio contro Acqua
- Tiri: player 5, nemico 2

Punteggio player:
- 6 + 3 + 5 - 2 + 2 = 14

Punteggio nemico:
- 7 + 4 + 2 + 2 + 0 = 15

Differenza = 1
Danno al player = 4 + (1 x 2) = 6

### Esempio 3: Nemico basso livello ma pericoloso (modificatore)
- Player livello 3: Strength 5, Luck 2, elemento Aria
- Nemico livello 2: Strength 3, elemento Terra, modificatore Furioso (+2 Strength)
- Relazione elementale: Aria in svantaggio contro Terra
- Tiri: player 2, nemico 6

Punteggio player:
- 5 + 2 + 2 - 2 + 1 = 8

Punteggio nemico:
- (3 + 2) + 1 + 6 + 2 + 0 = 14

Differenza = 6
Danno al player = 4 + (6 x 2) = 16

Messaggio di design:
Anche un nemico di livello basso puo` essere pericoloso con i giusti tratti e contesto.

## Regole di Tuning Rapido
Se gli scontri sono troppo lunghi:
- Aumenta BaseDanno a 5
- Oppure aumenta Fattore a 3

Se gli scontri sono troppo punitivi:
- Riduci Fattore a 1
- Oppure riduci bonus/malus elementale da 2 a 1

Se il livello pesa troppo poco:
- Usa Bonus Livello = floor((livello - 1) x 1.5)

Se il livello pesa troppo:
- Usa Bonus Livello = floor((livello - 1) x 0.5)

## Sintesi
Questo sistema:
- premia la lettura della mappa,
- valorizza la barra da 100 HP,
- rende il livello un’informazione strategica,
- mantiene il feeling da JRPG classico con poca matematica mentale.
