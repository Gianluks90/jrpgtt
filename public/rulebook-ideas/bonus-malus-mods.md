# Elenco dei bonus/malus conferiti
Una lista di possibili effetti temporanei e non conferiti da eventi, oggetti, alleati, status, ecc... che possono influenzare le caratteristiche del personaggio o altri aspetti del gioco.

| Bonus/Malus | Descrizione |
| :--- | :--- |
| +-X Strength | Aumenta/diminuisce di X la forza del personaggio. Non aumenta/diminuisce conseguentemente gli HP massimi. |
| +-X Magic | Aumenta/diminuisce di X la magia del personaggio. |
| +-X Luck | Aumenta/diminuisce di X la fortuna del personaggio. |
| +-X spazio risorse | Aumenta/diminuisce di X la quantità di risorse che il personaggio può portare con sè. |
| danni subiti -X% | Riduce di X% i danni subiti dal personaggio. |
| +X% HP max | Aumenta di X% gli HP massimi del personaggio. |
| recover X% HP | Ripristina X% degli HP massimi del personaggio |
| -X% HP | Subisci un danno pari a X% degli HP massimi del personaggio |
| +X exp | Aumenta di X i punti esperienza del personaggio. |
| +X% exp ottenuta | Aumenta di X% i punti esperienza ottenuti (moltiplicatore). |
| costo merce -X | Riduce di X il costo degli oggetti presso i mercanti. |
| costo azioni santuario +-X | Aumenta/diminuisce di X il costo delle azioni legate ai santuari (attivazione, donazione, ecc...). |
| +-X denaro | Aumenta/diminuisce di X la quantità di denaro del personaggio al momento dell'applicazione del bonus/malus. |
| +-X HP | Aumenta/diminuisce di X gli HP correnti del personaggio in valore assoluto. |
| +-X HP max | Aumenta/diminuisce di X gli HP massimi del personaggio in valore assoluto. |
| cure ricevute +-X% | Aumenta/diminuisce di X% la quantità di HP recuperati da cure e rigenerazione. |
| danni inflitti +-X% | Aumenta/diminuisce di X% i danni inflitti dal personaggio. |
| danni inflitti +-X | Aumenta/diminuisce di X i danni inflitti dal personaggio in valore assoluto. |
| successo luck check +-X% | Aumenta/diminuisce di X% la probabilità di successo dei check fortuna. |
| soglia luck check +-X | Aumenta/diminuisce di X la soglia richiesta per il successo dei check fortuna. |
| +X reroll luck | Aggiunge X reroll disponibili ai check fortuna (per turno, round o combattimento in base ai modificatori). |
| efficacia preghiera santuario +-X% | Aumenta/diminuisce di X% l'efficacia della preghiera al santuario (es. HP recuperati). |
| raccolta risorse +X | Aumenta di X la quantità di risorse raccolte da azioni/esplorazione. |
| raccolta risorse +X% | Aumenta di X% la quantità di risorse raccolte da azioni/esplorazione. |
| immunità condizione ambientale | Annulla completamente gli effetti di una condizione ambientale specifica. |
| riduzione effetto condizione ambientale -X% | Riduce di X% l'impatto negativo di una condizione ambientale specifica. |
| durata status +-X turni | Aumenta/diminuisce di X turni la durata degli status positivi/negativi applicati. |

#### Modificatori

In combinazione agli effetti ci sono alcune opzioni che possono o no essere presenti e che ne modificano il comportamento:

| Opzione | Descrizione |
| :--- | :--- |
| [each-turn] | L'effetto si applica all'inizio di ogni turno fino alla scadenza del bonus/malus. Se non presente, l'effetto si applica una sola volta al momento dell'applicazione del bonus/malus. |
| [fight-only] | L'effetto si applica solo durante i combattimenti. Se non presente, l'effetto si applica in ogni situazione. |
| [element-related] | L'effetto è applicabile solo in relazione (corrispondenza, opposto, ecc...) ad un elemento specifico con cui si è in sintonia (attunement). Alcuni esempi: "utilizzabile solo se in sintonia con il fuoco" |
| [biome-related] | L'effetto è applicabile solo in relazione ad un bioma specifico in cui si trova il personaggio. Alcuni esempi: "utilizzabile solo nel deserto" |
| [time-related] | L'effetto è applicabile solo in relazione al tempo (giorno/notte). Alcuni esempi: "utilizzabile solo di notte" |
| [location-related] | L'effetto è applicabile solo in relazione ad una specifica posizione sulla mappa. Alcuni esempi: "utilizzabile solo in <luogo-specifico>". Questo luogo deve essere uno di quelli sempre presenti in ogni partita. |
| [turn-start] | L'effetto si applica all'inizio del turno. |
| [turn-end] | L'effetto si applica alla fine del turno. |
| [om-level-up] | L'effetto si applica quando il personaggio sale di livello. |
| [on-move] | L'effetto si applica quando il personaggio esegue un movimento. |
| [on-enter-cell] | L'effetto si applica quando il personaggio entra in una cella specifica. |
| [on-end-turn] | L'effetto si applica quando il personaggio conclude il proprio turno. |
| [once-per-turn] | L'effetto può attivarsi al massimo una volta per turno. |
| [once-per-round] | L'effetto può attivarsi al massimo una volta per round completo. |
| [once-per-game] | L'effetto può attivarsi una sola volta per l'intera partita. |
| [duration: X turns] | L'effetto dura esattamente X turni, indipendentemente da altre condizioni. |
| [stackable] | Più istanze dello stesso effetto possono sommarsi. |
| [non-stackable] | Più istanze dello stesso effetto non si sommano; vale solo una istanza. |
| [refresh-duration] | Se l'effetto viene riapplicato, la durata viene rinnovata invece di sommarsi. |
| [status-related] | L'effetto è applicabile solo con/senza uno status specifico del personaggio. |
| [luck-outcome-related] | L'effetto è applicabile solo in base all'esito del check fortuna (success, near-success, fail). |
| [quadrant-related] | L'effetto è applicabile solo in uno specifico quadrante della mappa. |
| [region-related] | L'effetto è applicabile solo in una specifica regione della mappa. |
| [special-cell-related] | L'effetto è applicabile solo su celle speciali (es. sanctuary, landmark). |
| [environment-size-related] | L'effetto scala in base alla dimensione dell'ambiente connesso. |
| [inventory-related] | L'effetto è applicabile solo al superamento di specifiche soglie di inventario/risorse. |