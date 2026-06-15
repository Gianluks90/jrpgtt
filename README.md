# Amulet - Roadmap e note di design

Ultimo aggiornamento: 2026-06-13

Questo file raccoglie lo stato generale delle idee di gameplay. Le specifiche piu dettagliate restano nei file in `public/rulebook-ideas/` e nei cataloghi in `public/configs/`.

## Progetto

- [ ] Rinominare la cartella consts/logs in app-logs o qualcosa del genere perchè altrimenti viene ignorato da git;

## Core Gameplay

- [x] Progressione del personaggio: Forza, Magia e Fortuna sono i tre parametri principali.
  - Forza aumenta gli HP massimi oltre il valore base.
  - Magia aumenta gli MP massimi oltre il valore base 3.
  - Fortuna modifica i controlli fortuna ed e sempre piu centrale per eventi, ricompense e magie instabili.
- [x] Esperienza da esplorazione: scoprire nuovi ambienti assegna esperienza e sostiene il ritmo di avanzamento.
- [x] Level up: quando l'esperienza raggiunge il livello corrente, il giocatore deve scegliere quale parametro aumentare tramite dialog dedicata.
- [x] Ciclo giorno/notte: il mondo alterna giorno e notte, con UI dedicata e animazione.
- [x] Turni e round: la partita procede a turni tra i giocatori, con recupero MP a fine turno.
- [x] Stati alterati: gli effetti temporanei sono catalogati e visibili finche durano.
- [x] Danni e cure ambientali: i biomi possono applicare condizioni come deserto ostile e acque rigeneranti.
- [x] Risorse e raccolta: i biomi forniscono risorse, inclusa `cloth`, con azioni contestuali e modificatori da condizioni.
- [x] Inventario, oggetti e cariche: gli oggetti possono occupare spazio, modificare parametri, avere valore di vendita o cariche.
- [x] Alleati/followers: supportano bonus, HP propri, categorie, stati e interazioni con luoghi speciali.
- [x] Scarti: oggetti, eventi e alleati possono finire in una pila degli scarti consultabile.
- [ ] Combattimento completo: esiste la base per statistiche, bonus fight-only e scaling dei nemici, ma il sistema JRPG completo resta da consolidare.
- [ ] Nemici persistenti sulla mappa: se un nemico non viene sconfitto potrebbe restare nella casella come minaccia visibile.
- [ ] Trappole nascoste: celle con effetti negativi o spostamenti forzati.
- [ ] Missioni secondarie personali o casuali.
- [ ] Codex di gioco: enciclopedia progressiva che si popola in base a biomi, luoghi, eventi, nemici, oggetti, follower e magie incontrati durante le partite.
- [ ] Achievement: obiettivi sbloccabili con ricompense cosmetiche come titoli, appellativi, cornici o piccoli elementi di personalizzazione non meccanici.

## Mappa, Luoghi e Movimento

- [x] Mappa a regioni: la mappa e divisa in tre settori/regioni con feedback visivo.
- [x] Sbiadimento/scurimento progressivo: le regioni avanzate hanno resa visiva distinta.
- [x] Fog of war: le celle vengono rivelate esplorando.
- [x] Luoghi speciali: capitali, citta, villaggi, campi, accademie, castelli, templi, cimiteri, altari e altri landmark sono configurati.
- [x] Safe places: i luoghi sicuri offrono azioni come attesa, cura, locanda, mercanti, mistico e viaggio rapido.
- [x] Fast travel: i luoghi sicuri scoperti possono collegarsi tramite viaggio rapido con costo e animazione.
- [x] Santuari elementali: quattro santuari legati ad Acqua, Fuoco, Aria e Terra possono essere scoperti e attivati.
- [x] Sintonia elementale: attivare o donare a un santuario permette di sintonizzarsi al suo elemento.
- [x] Influenza dei santuari: un santuario attivo influenza il quadrante e puo fornire bonus a chi e sintonizzato con lo stesso elemento.
- [x] Movimento diagonale condizionale: alcune condizioni o magie possono abilitare movimento diagonale.
- [ ] Indicatore preventivo del livello dei nemici per colonna/regione prima del movimento.
- [ ] Boss errante: nemico speciale mobile con ricompensa importante.
- [ ] Mercante misterioso: apparizione casuale con offerte rare o scambi particolari.

## Eventi Mondiali

- [x] Evento Mondiale Regione I -> Regione II: il primo ingresso confermato in Regione II puo attivare un evento persistente sul mondo.
- [x] Influenza dei santuari sull'Evento Mondiale: i santuari attivi in Regione I riducono il rischio di esiti negativi e aumentano quelli positivi.
- [x] Mutazioni dei biomi: l'evento puo trasformare biomi o applicare condizioni permanenti alle celle bersaglio.
- [x] Bonus nemici da evento: alcune mutazioni possono aumentare il livello dei nemici dell'area.
- [x] Flusso UI dedicato: annuncio, propagazione, sommario e dialog di dettaglio dell'Evento Mondiale.
- [x] Log evento: l'esito globale viene registrato nel diario partita.
- [ ] Eventi globali periodici: effetti temporanei ogni tot round, separati dall'Evento Mondiale di regione.
- [ ] Eventi unici Regione III: una seconda soglia importante potrebbe cambiare ancora il mondo.

## Sistema Elementale

- [x] Ogni santuario e associato a un elemento.
- [x] Il santuario attivo puo determinare l'influenza elementale del quadrante.
- [x] Il giocatore puo ottenere o cambiare sintonia elementale tramite santuario.
- [x] Bonus da sintonia nel quadrante influenzato: Forza, Magia e Fortuna ricevono un bonus quando il giocatore e allineato all'elemento locale.
- [ ] Ruota elementale completa in combattimento: Fuoco, Terra, Aria e Acqua devono ancora essere integrati nel sistema di battaglia con vantaggi/svantaggi.
- [ ] Debolezze elementali dinamiche legate a giorno/notte o eventi.
- [ ] Sinergie elementali tra giocatori sintonizzati allo stesso elemento.

## Magie

- [x] Grimorio del giocatore: i giocatori hanno uno spellbook con capienza configurabile.
- [x] Magie dei santuari: i quattro santuari possono concedere magie elementali iniziali.
- [x] Catalogo magie: le magie sono configurabili tramite catalogo e localizzabili.
- [x] Lancio magie da UI: il pannello comandi espone le magie conosciute e controlla MP, cooldown e timing.
- [x] Effetti implementati di base: movimento diagonale, stato su se stessi, cura e teletrasporto su celle esplorate.
- [x] Stati preparati per le magie future: sono stati aggiunti stati visibili come `flying`, `empowered`, `safe-step`, `mana-shield`, `spell-ward`, `petrified`, `anchored`, `fate-sight` e vincoli elementali temporanei.
- [x] Design delle nuove magie: `public/rulebook-ideas/spells.md` contiene costi, fonti, uso singolo, magie rare, magie da Accademia/Incantatrice e adattamenti da Talisman.
- [x] Magie subdole: e stata definita una categoria di varianti ripetibili ma poco affidabili, pensate per valorizzare Fortuna.
- [ ] Mazzo magie generiche e rare: da trasformare in cataloghi effettivi.
- [ ] Mercante magico dell'Accademia: gia previsto come fonte, ma da popolare con stock reale di magie.
- [ ] Incantatrice come fonte di magie narrative: da collegare alle magie casuali/rare.
- [ ] Contraffattore Arcano: servizio futuro per trasformare magie rare a uso singolo in versioni subdole.
- [ ] Toggle partita per magie subdole: le varianti instabili dovrebbero poter essere abilitate/disabilitate dalle impostazioni avanzate.
- [ ] Reazioni magiche: Contromagia, Discepolo e simili richiedono una finestra "al momento opportuno".
- [ ] Effetti globali anti-magia: Distruggi magia richiede uno stato o blocco globale di round.
- [ ] Controllo eventi futuri: Premonizione e Divinazione richiedono una coda/anteprima degli eventi locali.

## UI e Accessibilita

- [x] Pannelli principali della mappa: giocatori, utilita, log, stato mondo, ispettore cella.
- [x] Indicatore sintonia elementale.
- [x] Indicatore fortuna con animazione.
- [x] Animazione cambio giorno/notte.
- [x] Log partita consultabile.
- [x] Rulebook integrato con pagine localizzate.
- [x] Multilingua italiano/inglese: sistema i18n, menu lingua e cataloghi principali localizzati.
- [x] Tooltip e descrizioni per azioni, stati, oggetti, follower e condizioni.
- [ ] Dialog narrativi piu ricchi: estendere il trattamento visivo dei santuari ad altri elementi importanti come Incantatrice, Mistico, Cimitero, Accademia, Altare, boss ed eventi rari.
- [ ] Settings di partita avanzati: permettere di attivare/disattivare moduli opzionali come magie subdole, meteo, eventi globali periodici, boss errante, mercante misterioso e altre regole speciali.
- [ ] Animazioni dedicate per cambiamenti di stato, risorse, danni e guarigioni.
- [ ] Modalita color blind per mappa e regioni, con pattern oltre ai colori.

## Economia, Mercanti e Luoghi

- [x] Denaro iniziale e costi azione.
- [x] Mercanti configurabili con categorie accettate e stock esterno.
- [x] Compra/vendita con carrello e riepilogo.
- [x] Dottore/guaritore/locanda/castello: servizi di cura e riposo.
- [x] Mistico e Incantatrice: ricompense variabili tramite configurazione.
- [x] Cimitero: resurrezione rischiosa dei follower scartati.
- [x] Tempio e Altare: rilascio/sacrificio follower con cambio allineamento e ricompensa.
- [ ] Stock magico dell'Accademia da espandere.
- [ ] Servizi speciali futuri: Contraffattore Arcano, rimozione maledizioni avanzata, rituali rari.

## Idee sospese o da rivalutare

- [ ] Meteo: interessante se legato agli elementi, ma rischia di sovrapporsi a giorno/notte ed Evento Mondiale.
- [ ] Meteo opzionale: se implementato, dovrebbe essere governato dai settings avanzati di partita.
- [ ] Mini-mappa dinamica: utile per orientamento, ma al momento non prioritaria.
- [ ] Missioni segrete personali: buone per rigiocabilita, da progettare dopo combattimento e magie.
- [ ] Discepolo dotato: tenere come magia leggendaria o ricompensa unica, non come magia normale.

## Riferimenti di design

- Magie e varianti subdole: `public/rulebook-ideas/spells.md`
- Evento Mondiale: `public/rulebook-ideas/world-event.md`
- Combattimento JRPG: `public/rulebook-ideas/fight.md`
- Alleati/followers: `public/rulebook-ideas/followers.md`
- Stati alterati: `public/configs/statuses.config.json`
- Magie implementate: `public/configs/spells.config.json`
- Azioni e luoghi: `public/configs/actions.config.json`, `public/configs/landmarks.config.json`
