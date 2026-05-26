

# Idee suddivise per categoria

## Core Gameplay

- [x] Ogni punto Strength oltre il 3 (valore base) aumenta gli hp del 5% (parsato a intero). Commento: Aggiunge profondità alla crescita del personaggio, bilanciamento da valutare. Difficoltà: Media. Impatto: Medio.
- [x] Scoprire un nuovo ambiente ricompensa con 1 punto esperienza. Commento: Incentiva l’esplorazione, ottimo per il ritmo di gioco. Difficoltà: Bassa. Impatto: Medio.
- [x] Per avanzare di livello il player ha bisogno di tanti punti esperienza quanto è il suo livello attuale. Commento: Progressione semplice e scalabile, da testare per evitare stagnazione. Difficoltà: Bassa. Impatto: Medio.
- [x] Quando il player sale di livello si apre una dialog che chiede quale dei tre parametri aumentare di 1 punto (Strength, Magic, Luck) - la dialog non può essere chiusa (disableClose: true). Commento: Scelta forzata, interessante per coinvolgimento, attenzione all’usabilità. Difficoltà: Media. Impatto: Alto.
- [x] Si potrebbe includere il ciclo giorno notte che cambia ogni round... al X esimo giorno completo potrebbe succedere qualcosa. Commento: Aggiunge varietà e possibili eventi speciali, da valutare impatto su complessità. Difficoltà: Alta. Impatto: Alto.
- [ ] Si potrebbe introdurre il meteo (che influenza gli elementi) - strettamente legato al ciclo giorno/notte. Commento: Approfondisce la strategia, ma aumenta la complessità di gestione. Difficoltà: Alta. Impatto: Medio.
- [x] I nemici incontrati in una casella potrebbero avere un livello pari alla colonna in cui si trovano o a quelle adiacenti per variare le possibilità dei giocatori. Commento: Aumenta la varietà e la difficoltà degli incontri, rende la progressione più dinamica. Difficoltà: Media. Impatto: Medio.
- [ ] Quando un nemico non viene sconfitto resta nella casella dove è comparso in attesa del prossimo player, il suo marker potrebbe essere un rombo rosso lampeggiante. Commento: Aumenta la tensione e la strategia, aggiunge un feedback visivo chiaro e memorabile. Difficoltà: Media. Impatto: Alto.
- [ ] Modalità “Evento Globale”: ogni tot turni si attiva un evento che modifica temporaneamente le regole (es. tutti i danni raddoppiati, risorse che valgono il doppio, ecc.). Commento: Rende ogni partita unica e imprevedibile, stimola l’adattamento. Difficoltà: Alta. Impatto: Alto.
- [ ] Sistema di “Trappole” nascoste: alcune celle possono contenere trappole che si attivano al passaggio, con effetti variabili (perdita risorse, spostamento forzato, ecc.). Commento: Aggiunge rischio e varietà all’esplorazione. Difficoltà: Media. Impatto: Medio.
- [ ] “Missioni secondarie” casuali: ogni giocatore può ricevere una missione personale segreta che, se completata, dà bonus unici. Commento: Incentiva strategie personali e diversifica gli obiettivi. Difficoltà: Media. Impatto: Medio.

## UI

- [x] Una linea, alta massimo 3-4 px allineata alla quinta colonna e una alla settima colonna mostrano la distinzione tra i settori della mappa. Commento: Migliora la leggibilità della mappa. Difficoltà: Bassa. Impatto: Basso.
- [x] Il colore delle celle nei settori 2 e 3 potrebbe andare via via sbiadendosi oppure scurendosi man mano che si va verso il lato destro della mappa. Commento: Ottima idea per feedback visivo e atmosfera. Difficoltà: Media. Impatto: Medio.
- [ ] Animazioni per i cambiamenti di stato (es. livello, risorse, condizioni meteo) per aumentare il coinvolgimento. Commento: Rende l’esperienza più immersiva e chiara. Difficoltà: Media. Impatto: Basso.
- [ ] Durante il proprio turno prima di selezionare il movimento sotto le colonne interessate comparirà l'indicazione del livello dei nemici che si possono incontrare in quelle colonne. Commento: Fornisce informazioni utili per la strategia, migliora la pianificazione. Difficoltà: Media. Impatto: Alto.

## Eventi Speciali

- [ ] La prima volta che un player entra nel settore 2 succede qualcosa. Commento: Evento unico che incentiva l’esplorazione. Difficoltà: Media. Impatto: Medio.
- [ ] La prima volta che un player entra nel settore 3 succede qualcosa. Commento: Evento unico che incentiva l’esplorazione. Difficoltà: Media. Impatto: Medio.
- [ ] Le quattro caselle speciali ospiteranno i santuari degli elementi... la prima volta che un player entra in una di queste caselle succede qualcosa. Commento: Eventi unici che incentivano l’esplorazione e la narrazione. Difficoltà: Alta. Impatto: Alto.
- [ ] Quando si scopre una nuova tessera si pesca anche un elemento di dettaglio che può essere varie cose (es. un punto di interesse, un npc, una missione, niente, una città, ecc...). Commento: Aumenta la varietà e la sorpresa nell’esplorazione, stimola la narrazione emergente. Difficoltà: Media. Impatto: Alto.
- [ ] “Boss errante”: un nemico speciale che si muove casualmente sulla mappa e offre una ricompensa importante se sconfitto. Commento: Sfida opzionale che aggiunge tensione e ricompense speciali. Difficoltà: Alta. Impatto: Alto.
- [ ] “Mercante misterioso”: appare casualmente e offre scambi vantaggiosi o oggetti rari. Commento: Offre opportunità di scambio e sorprese durante la partita. Difficoltà: Media. Impatto: Medio.

## Sistema Elementale

- [x] Il santuario dell'elemento determina l'elemento dominante nel suo quadrante. Commento: Sistema interessante per strategia e rigiocabilità. Difficoltà: Media. Impatto: Medio.
- [x] Un player inizia senza elemento ma può favorirne uno visitando un santuario (visitando un altro santuario è possibile cambiare elemento). Commento: Sistema interessante per strategia e rigiocabilità. Difficoltà: Media. Impatto: Medio.
- [ ] Potrebbe essere interessante aggiungere una nuova risorsa (tessuto). Commento: Amplia le possibilità di crafting e gestione risorse, da bilanciare con le altre risorse. Difficoltà: Bassa. Impatto: Basso.
- [ ] Sinergie elementali: se più giocatori favoriscono lo stesso elemento, si sblocca un potere globale temporaneo per tutti. Commento: Stimola la collaborazione e la strategia tra i giocatori. Difficoltà: Alta. Impatto: Alto.
- [ ] Debolezze elementali dinamiche: ogni giorno/notte cambia la debolezza di un elemento, influenzando le strategie. Commento: Rende la scelta dell’elemento più interessante e variabile. Difficoltà: Media. Impatto: Medio.
- [ ] Vantaggio e svantaggio elementale: ogni nemico ha un elemento dominante, i personaggi no, ma quando ne ottengono uno hanno vantaggio sull’elemento opposto e svantaggio verso di loro (fuoco-acqua, aria-terra). In combattimento tra opposti si infliggono e subiscono il doppio dei danni. Commento: Aggiunge profondità tattica e incentiva la scelta dell’elemento, rende i combattimenti più strategici e rischiosi. Difficoltà: Media. Impatto: Alto.

## Accessibilità / Internazionalizzazione

- [ ] Multilingua (i18n) - almeno italiano e inglese. Commento: Fondamentale per ampliare il pubblico. Difficoltà: Media. Impatto: Alto.
- [ ] Modalità “color blind” per la mappa, con pattern oltre ai colori per distinguere i settori. Commento: Migliora l’accessibilità per tutti i giocatori. Difficoltà: Media. Impatto: Medio.

# Idee scartate o sospese

- [ ] Mini-mappa dinamica che mostra solo le aree esplorate dal proprio personaggio. Commento: Migliora l’orientamento e il senso di scoperta. Difficoltà: Media. Impatto: Basso.