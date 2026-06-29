/* ═══════════════════════════════════════════════════
   AVIS Flotta — firebase.js
   Sincronizzazione cloud con Firebase Firestore.

   CONFIGURAZIONE: sostituisci l'oggetto firebaseConfig
   con i valori del tuo progetto Firebase (vedi README).
   ═══════════════════════════════════════════════════ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  enableIndexedDbPersistence,
  serverTimestamp,
  query,
  orderBy,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';


const firebaseConfig = {
  apiKey: "AIzaSyA86HwD8OH1WCbNH_YFPebW46jaMutScYc",
  authDomain: "avis-flotta.firebaseapp.com",
  projectId: "avis-flotta",
  storageBucket: "avis-flotta.firebasestorage.app",
  messagingSenderId: "508775208428",
  appId: "1:508775208428:web:f7bfec3df813483d1f1cc9",
  measurementId: "G-GZFYEB7HH9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

let app, db;
let syncAttivo = false;
const unsubscribers = [];

/* ── Inizializzazione ── */
export async function inizializzaFirebase() {
  if (firebaseConfig.apiKey === 'SOSTITUISCI') {
    console.warn('[Firebase] Configurazione non impostata — sync disabilitata');
    return false;
  }

  try {
    app = initializeApp(firebaseConfig);
    db  = getFirestore(app);

    /* Persistenza offline di Firestore (cache locale automatica) */
    await enableIndexedDbPersistence(db).catch(err => {
      if (err.code === 'failed-precondition') {
        console.warn('[Firebase] Persistenza offline: più tab aperti');
      } else if (err.code === 'unimplemented') {
        console.warn('[Firebase] Persistenza offline non supportata');
      }
    });

    syncAttivo = true;
    console.log('[Firebase] Connesso e sincronizzazione attiva');
    return true;
  } catch (err) {
    console.error('[Firebase] Errore inizializzazione:', err);
    return false;
  }
}

export function isSyncAttivo() { return syncAttivo; }

/* ── Helpers ── */
function colRef(nome) {
  return collection(db, nome);
}

function docRef(nome, id) {
  return doc(db, nome, String(id));
}

/* Converte un documento Firestore in oggetto plain,
   aggiungendo l'id come campo numerico */
function fromFirestore(snap) {
  if (!snap.exists()) return null;
  const d = snap.data();
  return { ...d, id: parseInt(snap.id) || snap.id };
}

/* ── SCRITTURA: invia un record su Firestore ── */
export async function syncRecord(collezione, record) {
  if (!syncAttivo) return;
  try {
    const { id, ...dati } = record;
    await setDoc(docRef(collezione, id), {
      ...dati,
      _aggiornato: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.error(`[Firebase] Errore scrittura ${collezione}:`, err);
  }
}

/* ── CANCELLAZIONE: rimuove un record da Firestore ── */
export async function deleteRecord(collezione, id) {
  if (!syncAttivo) return;
  try {
    await deleteDoc(docRef(collezione, id));
  } catch (err) {
    console.error(`[Firebase] Errore cancellazione ${collezione}/${id}:`, err);
  }
}

/* ── LISTENER REAL-TIME ──
   Ascolta i cambiamenti Firestore e aggiorna IndexedDB + UI.
   Ogni chiamata registra un listener che rimane attivo finché
   non si chiama stopSync(). */
export function startListener(collezione, dexieTable, onUpdate) {
  if (!syncAttivo) return;

  const q = query(colRef(collezione), orderBy('_aggiornato', 'desc'));

  const unsub = onSnapshot(q, async (snapshot) => {
    const changes = snapshot.docChanges();
    if (!changes.length) return;

    for (const change of changes) {
      const data = fromFirestore(change.doc);
      if (!data) continue;

      if (change.type === 'added' || change.type === 'modified') {
        /* Upsert: aggiorna il record locale se Firestore è più recente */
        await dexieTable.put(data).catch(() => {});
      }

      if (change.type === 'removed') {
        await dexieTable.delete(data.id).catch(() => {});
      }
    }

    /* Notifica l'app che i dati sono cambiati */
    if (typeof onUpdate === 'function') onUpdate();
  }, (err) => {
    console.error(`[Firebase] Errore listener ${collezione}:`, err);
  });

  unsubscribers.push(unsub);
}

/* ── Ferma tutti i listener (utile al logout / cleanup) ── */
export function stopSync() {
  unsubscribers.forEach(u => u());
  unsubscribers.length = 0;
  syncAttivo = false;
}

/* ── Upload iniziale: carica su Firestore i dati già in IndexedDB ──
   Utile la prima volta che si collega il cloud su un'installazione
   già in uso, per non perdere i dati esistenti. */
export async function uploadIniziale(dexieTables) {
  if (!syncAttivo) return;

  const tabelle = [
    { nome: 'veicoli',      table: dexieTables.veicoli },
    { nome: 'rifornimenti', table: dexieTables.rifornimenti },
    { nome: 'manutenzioni', table: dexieTables.manutenzioni },
    { nome: 'segnalazioni', table: dexieTables.segnalazioni },
  ];

  for (const { nome, table } of tabelle) {
    const records = await table.toArray();
    for (const r of records) {
      await syncRecord(nome, r);
    }
    console.log(`[Firebase] Upload iniziale ${nome}: ${records.length} record`);
  }
}
