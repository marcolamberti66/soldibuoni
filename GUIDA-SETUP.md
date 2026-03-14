# 🚀 GUIDA SETUP SOLDI BUONI — Passo per passo

## Cosa c'è nel pacchetto

```
soldibuoni-completo/
├── index.html                              ← Il sito web
├── netlify.toml                            ← Configurazione Netlify
└── netlify/
    └── functions/
        ├── brevo.mjs                       ← Gestisce iscrizioni newsletter e promemoria auto
        ├── car-reminders.mjs               ← Gira OGNI GIORNO alle 9:00 e manda promemoria 7gg prima
        └── update-deadlines.mjs            ← Gira OGNI LUNEDÌ e aggiorna scadenze scadute all'anno dopo
```

### Come funziona il sistema automatico:
1. L'utente compila il form auto → i dati vanno a Brevo → riceve email di conferma
2. Ogni giorno alle 9:00 (ora italiana), la funzione car-reminders controlla TUTTI i contatti
3. Se qualcuno ha una scadenza tra esattamente 7 giorni → riceve una email personalizzata
4. Ogni lunedì, la funzione update-deadlines aggiorna le date scadute all'anno/ciclo successivo
5. Il sistema gira da solo all'infinito, senza che tu debba fare nulla

---

## FASE 1: Configurare Brevo (10 minuti)

### 1.1 — Prendi la tua API Key da Brevo
1. Vai su https://app.brevo.com
2. Clicca sul tuo nome in alto a destra → **SMTP & API**
3. Nella sezione "API Keys", clicca **Generate a new API key**
4. Dagli un nome (es: "Soldi Buoni")
5. **COPIA LA CHIAVE** e salvala da qualche parte (ti servirà dopo)

### 1.2 — Crea le liste contatti
1. Vai su **Contacts** → **Lists**
2. Clicca **Create a list**
3. Crea queste 2 liste:
   - **"Newsletter Soldi Buoni"** → segna il numero ID (lo vedi nell'URL, es: /lists/2)
   - **"Promemoria Auto"** → segna il numero ID (es: /lists/3)

### 1.3 — Crea gli attributi personalizzati (per i promemoria auto)
1. Vai su **Contacts** → **Settings** (icona ingranaggio) → **Contact attributes**
2. Clicca **Add a new attribute** per ciascuno di questi:

| Nome attributo        | Tipo    |
|-----------------------|---------|
| NOME                  | Text    |
| TARGA                 | Text    |
| SCADENZA_BOLLO        | Date    |
| SCADENZA_REVISIONE    | Date    |
| SCADENZA_TAGLIANDO    | Date    |
| SCADENZA_GOMME_INV    | Date    |
| SCADENZA_GOMME_EST    | Date    |

### 1.4 — Verifica il mittente email
1. Vai su **Senders, Domains & Dedicated IPs** → **Senders**
2. Aggiungi un nuovo mittente: `noreply@soldibuoni.it`
3. Oppure usa una tua email personale (es: tuonome@gmail.com)
4. Brevo ti manda una mail di verifica — cliccala

### 1.5 — (NON NECESSARIO) Automazioni
Le automazioni per i promemoria auto sono già gestite automaticamente dal codice.
La funzione `car-reminders.mjs` gira ogni giorno e invia le email 7 giorni prima di ogni scadenza.
Non devi configurare nulla su Brevo per questa parte. Tutto funziona da solo.

---

## FASE 2: Pubblicare su Netlify (15 minuti)

⚠️ Il drag-and-drop di Netlify NON supporta le Functions (il backend per Brevo).
Devi usare **Netlify CLI** (riga di comando). È facilissimo, segui passo passo.

### 2.1 — Installa Node.js
1. Vai su https://nodejs.org
2. Scarica la versione **LTS** (quella con il pulsante verde grande)
3. Installalo (Next, Next, Next... come un programma qualsiasi)
4. Riavvia il computer

### 2.2 — Prepara la cartella
1. Scarica il file **soldibuoni-completo.zip**
2. Estrailo (tasto destro → Estrai tutto)
3. Dovresti avere una cartella con dentro: `index.html`, `netlify.toml`, e la cartella `netlify/`

### 2.3 — Apri il Terminale
- **Windows**: premi il tasto Windows, scrivi "cmd", premi Invio
- **Mac**: apri Spotlight (Cmd+Spazio), scrivi "Terminal", premi Invio

### 2.4 — Vai nella cartella del progetto
Scrivi nel terminale (sostituisci il percorso con il tuo):

**Windows:**
```
cd C:\Users\TUONOME\Desktop\soldibuoni-completo
```

**Mac:**
```
cd ~/Desktop/soldibuoni-completo
```

### 2.5 — Installa Netlify CLI e fai il deploy
Copia e incolla questi comandi uno per volta, premendo Invio dopo ognuno:

```
npm install -g netlify-cli
```
(aspetta che finisca)

```
netlify login
```
(si apre il browser — clicca "Authorize")

```
netlify link
```
(ti chiede "How do you want to link this folder?" → scegli "Use current git remote origin" 
   OPPURE "Choose from a list of your recently updated sites" → seleziona il sito soldibuoni)

```
netlify deploy --prod
```
(ti chiede "Publish directory" → scrivi `.` (solo un punto) e premi Invio)

**FATTO! Il sito è online con le Functions.** 🎉

### 2.6 — Configura le variabili d'ambiente (la API key)
1. Vai su https://app.netlify.com
2. Clicca sul tuo sito → **Site configuration** → **Environment variables**
3. Clicca **Add a variable** e aggiungi queste:

| Key                         | Value                                  |
|-----------------------------|----------------------------------------|
| BREVO_API_KEY               | (la API key che hai copiato al punto 1.1) |
| SENDER_EMAIL                | noreply@soldibuoni.it (o la tua email verificata) |
| BREVO_NEWSLETTER_LIST_ID    | 2 (o il numero della tua lista Newsletter) |
| BREVO_CAR_LIST_ID           | 3 (o il numero della tua lista Promemoria Auto) |

4. Dopo aver aggiunto le variabili, vai su **Deploys** → clicca **Trigger deploy** → **Deploy site**
   (serve per far leggere le nuove variabili)

---

## FASE 3: Verifica (5 minuti)

1. Apri https://soldibuoni.it
2. Nella home, inserisci la tua email nel form "Monitoraggio Rincari" e clicca "Attiva"
3. Controlla la tua email — dovresti ricevere la mail di benvenuto
4. Vai su Mobilità → Bollo/Revisione → Comparatore → compila il form auto
5. Clicca "Calcola Scadenze & Attiva Promemoria"
6. Controlla email — dovresti ricevere il riepilogo scadenze
7. Vai su Brevo → Contacts → dovresti vedere i nuovi contatti nelle liste

Se tutto funziona, sei operativo al 100%! 🚀

---

## AGGIORNARE I PREZZI DEI COMPARATORI

I prezzi nei comparatori (energia, gas, internet, assicurazioni, università, pensione) sono
scritti direttamente nel codice HTML. Per aggiornarli:

1. Apri index.html con un qualsiasi editor di testo (Notepad, VS Code)
2. Cerca la sezione dei dati (prime ~120 righe del blocco <script>)
3. Modifica i numeri
4. Salva
5. Rifai il deploy: apri il terminale nella cartella e scrivi `netlify deploy --prod`

I dati sono organizzati chiaramente:
- ENERGY_PROVIDERS → tariffe energia
- GAS_PROVIDERS → tariffe gas
- INTERNET_PROVIDERS → offerte internet
- INSURANCE_DATA → RC Auto
- HEALTH_INSURANCE → polizze sanitarie
- UNI_DATA → rette universitarie
- PENSION_FUNDS → fondi pensione

Ti consiglio di aggiornarli una volta ogni 2-3 mesi.

---

## MONITORAGGIO: Come verificare che tutto funzioni

### Controllare i log delle funzioni automatiche
1. Vai su https://app.netlify.com → il tuo sito
2. Clicca su **Functions** nel menu in alto
3. Vedrai 3 funzioni:
   - `brevo` — si attiva quando qualcuno compila un form
   - `car-reminders` — si attiva ogni giorno alle 8:00 UTC
   - `update-deadlines` — si attiva ogni lunedì alle 6:00 UTC
4. Cliccando su una funzione vedi i log: quante email ha mandato, eventuali errori

### Controllare i contatti su Brevo
1. Vai su https://app.brevo.com → Contacts
2. Nella lista "Newsletter Soldi Buoni" vedi tutti gli iscritti alla newsletter
3. Nella lista "Promemoria Auto" vedi i contatti con le scadenze salvate
4. Cliccando su un contatto vedi tutti i suoi attributi (date scadenze, targa, ecc.)

### Controllare le email inviate
1. Su Brevo → Transactional → Logs
2. Qui vedi TUTTE le email inviate: conferme, benvenuto, promemoria
3. Puoi verificare se sono state consegnate, aperte, cliccate

---

## RIEPILOGO: Cosa è automatico e cosa no

| Funzionalità | Automatico? | Note |
|---|---|---|
| Raccolta email newsletter | ✅ Sì | L'utente si iscrive, email di benvenuto automatica |
| Raccolta dati auto | ✅ Sì | L'utente compila, dati salvati su Brevo, email di conferma |
| Promemoria 7gg prima | ✅ Sì | La funzione gira ogni giorno e manda email |
| Rinnovo scadenze annuali | ✅ Sì | Le date si aggiornano da sole ogni lunedì |
| Aggiornamento prezzi comparatori | ❌ No | Da fare manualmente nel codice ogni 2-3 mesi |
| Invio newsletter periodiche | ❌ No | Da fare manualmente su Brevo (Campaigns) |
