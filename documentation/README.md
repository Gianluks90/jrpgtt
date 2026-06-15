# Documentazione di gioco

Indice delle guide per aggiungere nuovi elementi al gioco.

## A colpo d'occhio

| Elemento | Guida | Basta il JSON? |
|---|---|---|
| Incantesimo (Spell) | [new-spell-guide.md](new-spell-guide.md) | Sì, se riusi un tipo di effetto già esistente |
| Oggetto (Item) | [new-item-guide.md](new-item-guide.md) | Sì, se riusi category e tipi di effetto già esistenti |
| Seguace (Follower) | [new-follower-guide.md](new-follower-guide.md) | Quasi sempre |
| Punto di interesse (Landmark) | [new-landmark-guide.md](new-landmark-guide.md) | Quasi sempre |
| Azione (Action) | [new-action-guide.md](new-action-guide.md) | Sì, se riusi un handler già esistente |
| Condizione bioma (Condition) | [new-condition-guide.md](new-condition-guide.md) | Sì, se riusi un tipo di effetto già esistente |
| Status del player | [new-status-guide.md](new-status-guide.md) | Per la definizione sì; per applicarlo serve codice |

## Regola d'oro

I file in `public/configs/` sono JSON — puoi modificarli tu.
I file in `src/` sono TypeScript — quelli li tocca uno sviluppatore.

La stragrande maggioranza degli elementi del gioco si crea o si estende lavorando solo sui file JSON.
