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

1. Crea un account su [github.com](https://github.com) se non ce l'hai
2. Crea un nuovo repository (es. `avis-flotta`)
3. Carica tutti i file della cartella `avis-flotta-pwa/`
4. Vai in Settings → Pages → Source: "main branch"
5. L'app sarà disponibile su `https://tuonome.github.io/avis-flotta/`

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
