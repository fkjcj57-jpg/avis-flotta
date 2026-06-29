# AVIS Flotta PWA — Provinciale Brescia

Applicazione web progressiva (PWA) per la gestione della flotta veicoli AVIS Provinciale Brescia.
Funziona su Android, iPhone, iPad e computer — senza installazione da app store.

---

## Funzionalità

- **Dashboard** con scadenze urgenti, alert colorati e ultime attività
- **Gestione veicoli** con semaforo scadenze (tagliando, bollo, revisione, assicurazione)
- **Rifornimenti** con storico e statistiche costi/litri
- **Manutenzioni** ordinarie e straordinarie con officina e costi
- **Segnalazioni guasti** con priorità e gestione stato (aperta → in lavorazione → chiusa)
- **Funzionamento offline** completo con IndexedDB
- **Notifiche push** per scadenze imminenti
- **Export/import JSON** per backup manuale
- **Installabile** su home screen Android, iPhone, PC

---

## Struttura file

```
avis-flotta-pwa/
├── index.html          ← Entry point, struttura HTML, modali
├── style.css           ← Design system, layout responsive, dark mode
├── app.js              ← Logica UI, navigazione, form, rendering
├── db.js               ← Layer dati IndexedDB (Dexie.js)
├── sw.js               ← Service Worker (cache, offline, push)
├── manifest.json       ← Metadati PWA per installazione
├── icons/
│   ├── icon-192.png    ← Icona 192×192 (da creare)
│   └── icon-512.png    ← Icona 512×512 (da creare)
└── README.md           ← Questo file
```

---

## Setup e deployment

### 1. Crea le icone

Hai bisogno di due PNG con il logo AVIS (o una A rossa su sfondo bianco):
- `icons/icon-192.png` — 192×192 pixel
- `icons/icon-512.png` — 512×512 pixel

Puoi generarle su [realfavicongenerator.net](https://realfavicongenerator.net) partendo dal logo AVIS.

### 2. Scegli dove pubblicare

#### Opzione A — GitHub Pages (gratuito, consigliato)

GitHub Pages è **completamente gratuito** per repository pubblici con qualsiasi account GitHub Free — nessuna carta di credito richiesta. Il codice sorgente (i file HTML/JS/CSS) sarà visibile pubblicamente, ma i dati della flotta rimangono sul dispositivo di chi usa l'app (IndexedDB locale). Se vuoi tenere il codice privato, servono i piani a pagamento GitHub Pro/Team.

1. Crea un account su [github.com](https://github.com) se non ce l'hai
2. Crea un nuovo repository **pubblico** (es. `avis-flotta`)
3. Carica tutti i file della cartella `avis-flotta-pwa/`
4. Vai in Settings → Pages → Source: "main branch"
5. L'URL esatto lo trovi in Settings → Pages, mostrato in verde sotto "Your site is live at". Il formato è `https://<tuonomeutente>.github.io/<nomerepo>/` — sostituisci con il tuo nome utente GitHub e il nome che hai dato al repository

**Importante:** il Service Worker richiede HTTPS — GitHub Pages lo fornisce automaticamente.

#### Opzione B — Server AVIS esistente

Se AVIS ha già un server web (es. per il sito istituzionale):
1. Carica i file in una sottocartella, es. `/flotta/`
2. Assicurati che il server serva i file con HTTPS
3. Verifica che non ci siano restrizioni CORS sui file `.json`

#### Opzione C — Netlify (gratuito, drag & drop)

1. Vai su [netlify.com](https://netlify.com)
2. Drag & drop dell'intera cartella `avis-flotta-pwa/`
3. Ottieni un URL HTTPS immediato

---

## Installazione sui dispositivi

### Android (Chrome)
1. Apri l'URL nel browser Chrome
2. Appare automaticamente il banner "Installa app" (gestito da `beforeinstallprompt`)
3. Oppure: menu ⋮ → "Aggiungi a schermata Home"

### iPhone / iPad (Safari 16.4+)
1. Apri l'URL in Safari
2. Tocca il tasto condividi (rettangolo con freccia su)
3. Scorri e tocca "Aggiungi a schermata Home"
4. L'app si apre in modalità fullscreen come un'app nativa

### PC (Chrome / Edge)
1. Appare l'icona di installazione nella barra degli indirizzi
2. Oppure: menu → "Installa AVIS Flotta"

---

## Notifiche push

Le notifiche push sono attivabili dall'icona campanella nella topbar.
Per il funzionamento su tutti i dispositivi in produzione, servono:
- **VAPID keys** (generate con `web-push generate-vapid-keys`)
- Un piccolo server Node.js o endpoint serverless per inviare le push

Per ora le notifiche funzionano in locale — il Service Worker le gestisce
internamente controllando le scadenze dal database locale.

---

## Backup dati

I dati sono salvati in **IndexedDB** nel browser del dispositivo.
Per non perdere i dati:

1. Usa il pulsante **⬇ Esporta** in alto a destra per scaricare un file JSON
2. Conserva i backup in una cartella condivisa AVIS (SharePoint/Google Drive)
3. Per ripristinare: importa il file JSON dall'app

**Nota:** I dati su un dispositivo non si sincronizzano automaticamente
con altri dispositivi (è standalone). Per la sincronizzazione multi-device
è necessario aggiungere un backend (Firebase o Supabase, vedi sezione avanzata).

---

## Aggiornamenti

Quando aggiorni i file sul server, il Service Worker aggiorna automaticamente
la cache. Gli utenti vedono un toast "Aggiornamento disponibile — ricarica".
Per forzare l'aggiornamento immediato, modifica `CACHE_NAME` in `sw.js`
(es. `avis-flotta-v2`).

---

## Sincronizzazione multi-device con Firebase

Per condividere i dati tra PC e smartphone segui questi passaggi — tutto gratuito con il piano Spark di Firebase.

### 1. Crea il progetto Firebase

1. Vai su [console.firebase.google.com](https://console.firebase.google.com)
2. Clicca **Aggiungi progetto** → dai un nome (es. `avis-flotta-bs`) → continua
3. Disabilita Google Analytics (non serve) → **Crea progetto**

### 2. Attiva Firestore

1. Nel menu laterale: **Firestore Database** → **Crea database**
2. Scegli **Inizia in modalità produzione**
3. Seleziona la regione `europe-west6` (Zurigo, la più vicina)
4. Clicca **Avanti** → **Fine**

### 3. Configura le regole di sicurezza Firestore

Nel pannello Firestore → tab **Regole**, sostituisci tutto con:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

Clicca **Pubblica**. (In futuro puoi aggiungere Firebase Auth per limitare l'accesso ai soli utenti AVIS.)

### 4. Ottieni le credenziali

1. Vai in **Impostazioni progetto** (icona ingranaggio in alto a sinistra)
2. Scorri fino a **Le tue app** → clicca l'icona `</>` (Web)
3. Dai un soprannome (es. `AVIS Flotta PWA`) → **Registra app**
4. Copia l'oggetto `firebaseConfig` che appare

### 5. Incolla la configurazione in `firebase.js`

Apri `firebase.js` e sostituisci il blocco `firebaseConfig` con i valori copiati:

```javascript
const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "avis-flotta-bs.firebaseapp.com",
  projectId:         "avis-flotta-bs",
  storageBucket:     "avis-flotta-bs.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
};
```

### 6. Carica i file aggiornati su GitHub

Carica `firebase.js`, `db.js` e `index.html` aggiornati nel repository. Al prossimo caricamento:
- I dati locali esistenti vengono caricati su Firestore automaticamente (una sola volta)
- I listener real-time si attivano: qualsiasi modifica su un dispositivo appare subito sugli altri

### Limiti piano gratuito Firebase (Spark)

| Risorsa | Limite gratuito | Stima AVIS |
|---------|----------------|-----------|
| Letture/giorno | 50.000 | ~500 — ampiamente sotto |
| Scritture/giorno | 20.000 | ~100 — ampiamente sotto |
| Storage | 1 GB | < 1 MB |
| Banda | 10 GB/mese | trascurabile |

Il piano gratuito è più che sufficiente per una flotta di 10–20 veicoli.

---

## Estensioni future

- **Sync multi-device**: aggiungere Firebase Firestore (gratuito fino a 50k letture/giorno)
- **Foto**: allegare foto ai guasti usando `<input type="file" accept="image/*" capture>`
- **QR code veicolo**: ogni veicolo ha un QR che apre direttamente la sua scheda
- **Report PDF**: esportare il riepilogo mensile come PDF con jsPDF
- **Integrazione Power Automate**: quando si aggiunge una segnalazione urgente,
  inviare un'email automatica a Michela/Sara tramite il flusso esistente

---

## Requisiti browser

| Browser | Versione minima | Note |
|---------|----------------|------|
| Chrome Android | 90+ | Notifiche push + install |
| Safari iOS | 16.4+ | PWA installabile |
| Chrome desktop | 90+ | Tutte le funzioni |
| Edge | 90+ | Tutte le funzioni |
| Firefox | 90+ | Senza notifiche push |

---

*AVIS Provinciale Brescia — Responsabile Flotta e IT*
