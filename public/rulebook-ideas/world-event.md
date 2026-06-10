# World event
Quando un giocatore per la prima volta entra nella Regione II viene rilasciato un evento mondiale che rischia di modificare permanentemente il mondo di gioco. 

#### Come viene attivato
L'evento si attiva una sola volta quando un qualsiasi giocatore accetta di entrare nella Regione II da qualsiasi casella della Regione I. L'evento si applica a tutto il mondo non direttamente ai giocatori.

#### Cosa cambia
In base all'evento che viene selezionato i biomi possono assumere modificatori importanti (alcuni anche positivi ma con una probabilità minore). Alcune volte è anche possibile che non accada nulla mentre può succedere che oltre alla modifica il luogo diventa anche più pericoloso (aumentando il livello dei nemici in quell'area).

#### Influenzare l'Evento

Al mondo ci sono 4 luoghi sacri chiamati Santuari votati ciascuno ad un elemento: Fuoco, Acqua, Aria e Terra. Nella Regione I sono presenti 2 di questi Santuari. Attivare i Santuari affievolisce leggermente la probabilità di eventi negativi e di conseguenza aumenta la probabilità di quelli positivi. Se entrambi i Santuari vengono attivati, la probabilità di eventi positivi aumenta ulteriormente e quella di eventi negativi diminuisce ancora di più.

La selezione principale dell'evento (negativo, positivo, nessun cambiamento) usa questa tabella e somma sempre al 100%:

| Esito principale | 0 Santuari Attivati | 1 Santuario Attivato | 2 Santuari Attivati |
| --- | --- | --- | --- |
| Negativo | 75% | 70% | 65% |
| Positivo | 15% | 20% | 25% |
| Nessun cambiamento | 10% | 10% | 10% |

Il controllo "Nemici più forti" è separato e indipendente dal precedente. Dopo aver calcolato l'esito principale, viene fatto un secondo tiro:

| Controllo secondario | 0 Santuari Attivati | 1 Santuario Attivato | 2 Santuari Attivati |
| --- | --- | --- | --- |
| Nemici più forti | 10% | 9% | 8% |

Se questo secondo tiro riesce, i nemici nell'area interessata guadagnano +1 livello (massimo livello 10). Quindi in un singolo risultato possono coesistere: esito principale (negativo/positivo/nessun cambiamento) + bonus nemici. Se sulla stessa cella scattano sia il malus Pianura sia il tiro indipendente "Nemici più forti", si applica solo il valore più alto (non si somma) per evitare picchi troppo bruschi.

#### Processo di selezione dell'Evento

All'attivazione dell'Evento Mondiale vengono raccolte alcune info dall'attuale stato del mondo. Oltre ai già citati Santuari attivi vengono conteggiati il bioma più frequente e quello subito dopo in ordine di frequenza. Il primo bioma determina il bersaglio dell'Evento Mondiale mentre il secondo determina il pool di modifiche possibili in base alle percentuali viste precedentemente. 

In caso di parità tra biomi è consigliato usare una regola deterministica per evitare divergenze in multiplayer:

1. Priorità al bioma con almeno una cella rivelata più di recente.
2. Se persiste la parità, ordine fisso: foresta, pianura, montagna, acqua, deserto, rovina.

#### Aggiornamento della Mappa

Una volta estratto l'Evento: il bersaglio (bioma 1) e il responsabile delle modifiche (bioma 2) viene estratto per ogni cella interessata il risultato dell'Evento Mondiale. L'Evento è retroattivo quindi e sarà persistente anche sulle celle non ancora scoperte.

Per evitare effetti strani in partita, è consigliato separare:

1. Mappa reale runtime: usa bioma/condizioni aggiornate dall'evento.
2. Mappa già rivelata al giocatore: mantiene il bioma visualizzato al momento della scoperta (solo per coerenza UX), ma le regole della cella possono già essere cambiate nel backend.

Quando viene estratta una cella speciale (santuario/landmark/spawn), il risultato va ritirato sulla successiva cella valida. A fine processo è utile loggare nel diario partita il risultato globale: bioma bersaglio, bioma responsabile e numero di celle mutate.

> Esempio: il giocatore attivo entra nella Regione II e conferma di voler proseguire al suo interno. A conferma avvenuta il sistema raccoglie le informazioni: un santuario attivo su due, la foresta è il bioma più frequente seguito dal deserto. Il sistema sa che dovrà agire su ogni Foresta e inizia ad estrarre casualmente il modificatore in base alle percentuali di cui sopra (70% negativo, 20% positivo, 10% nessun cambiamento). La prima foresta per esempio non subisce modifiche entrando nel 10% di possibilità mentre quella subito accanto subisce il cambiamento negativo del deserto ovvero diventa essa stessa un deserto con il 70% di probabilità. In più, per ciascuna cella modificata viene effettuato il controllo indipendente "Nemici più forti": con 1 santuario attivo ha 9% di possibilità di applicare +1 livello nemici (massimo 10). Il sistema continua fino ad esaurire le foreste. Quando un giocatore muoverà in una nuova cella, prima che questa sia rivelata come Foresta (in questo caso specifico) verrà verificato il Cambiamento e potrebbe diventare un Deserto ancora prima di essere rivelata. Se invece il giocatore muove in una cella già rivelata, questa manterrà il suo bioma visualizzato anche se è stata modificata da un Evento Mondiale.

#### Elenco dei Cambiamenti per bioma

###### Foresta
Se è la foresta il secondo bioma più frequente:

| Cambiamento | Titolo | Prefisso/Suffisso | Descrizione |
| --- | --- | --- | --- |
| Negativo | Espansione | Invasa | Una cella a caso (che non contenga un luogo speciale) viene trasformata in Foresta |
| Positivo | Natura rigogliosa | Rigogliosa | La cella ottiene la condizione `abundant-resources` |

###### Deserto
Se è il deserto il secondo bioma più frequente:

| Cambiamento | Titolo | Prefisso/Suffisso | Descrizione |
| --- | --- | --- | --- |
| Negativo | Desertificazione | Arida | La cella diventa un Deserto |
| Positivo | Venti favorevoli | Scorrevole | La cella ottiene la condizione `swift-path` |

###### Acqua
Se è l'acqua il secondo bioma più frequente:

| Cambiamento | Titolo | Prefisso/Suffisso | Descrizione |
| --- | --- | --- | --- |
| Negativo | Inondazione | Sommersa | La cella diventa Acqua |
| Positivo | Fonte magica | Benedetta | La cella ottiene la condizione `regenerating-waters` |

###### Pianura
Se è la pianura il secondo bioma più frequente:

| Cambiamento | Titolo | Prefisso/Suffisso | Descrizione |
| --- | --- | --- | --- |
| Negativo | Campo di tiro | Esposta | I nemici nell'area interessata ottengono +1 livello per valore della Regione (I = +1, II = +2, III = +3), sempre con massimo livello 10 |
| Positivo | Campo aperto | Strategica | La cella ottiene la condizione `open-ground` |

###### Montagna
Se è la montagna il secondo bioma più frequente:

| Cambiamento | Titolo | Prefisso/Suffisso | Descrizione |
| --- | --- | --- | --- |
| Negativo | Terremoto | Invalicabile | La cella ottiene la condizione `impassable` |
| Positivo | Vena antica | Ricca | La cella ottiene la condizione `vein-of-plenty` |

###### Rovina
Se è la rovina il secondo bioma più frequente:

| Cambiamento | Titolo | Prefisso/Suffisso | Descrizione |
| --- | --- | --- | --- |
| Negativo | Corruzione antica | Maledetta | La cella ottiene la condizione `cursed-ground` |
| Positivo | Archivio perduto | Ispirata | La cella ottiene la condizione `ancient-knowledge` |


#### Condizioni legate all'Evento Mondiale

Nell'elenco precedente sono citate alcune condizioni dei biomi che possono essere generate dall'Evento Mondiale. Queste condizioni sono permanenti e si applicano a tutte le celle del bioma interessato. Di seguito una breve descrizione di queste condizioni:

- `abundant-resources`: la cella fornisce il doppio delle risorse normalmente fornite dal bioma (sia esplorando che raccogliendo tramite l'apposita azione).
- `regenerating-waters`: condizione già esistente. La cella rigenera HP terminando un turno nella cella secondo le regole attuali.
- `impassable`: non è possibile entrare nella cella, l'unico movimento consentito è uscire dalla cella interessata da questa condizione. Se questa condizione è applicata nella cella quando un giocatore si trova nella cella interessata, subisce 10% danni agli HP e viene spostato casualmente in una cella adiacente esplorata. Per bilanciamento è consigliato un cap massimo del 20% di celle `impassable` sul bioma bersaglio.
- `swift-path` (proposta): la prima mossa del turno da questa cella può ignorare una penalità ambientale o aumentare di 1 la portata effettiva del movimento.
- `open-ground` (proposta): dalla cella sono consentiti movimenti anche in diagonale, quindi verso tutti gli 8 spazi adiacenti (nei limiti dei bordi mappa e delle regole di attraversabilità).
- `vein-of-plenty` (proposta): bonus specifico raccolta minerali/risorse rare su questa cella.
- `ancient-knowledge` (proposta): bonus esperienza o bonus luck check quando il turno termina su questa cella.
- `cursed-ground` (proposta): malus permanente lieve (es. -1 luck effettiva in questa cella o piccolo drain HP a fine turno).