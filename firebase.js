/* AVIS Flotta — firebase.js */

const _fbConfig = {
  apiKey:            "AIzaSyA86HwD8OH1WCbNH_YFPebW46jaMutScYc",
  authDomain:        "avis-flotta.firebaseapp.com",
  projectId:         "avis-flotta",
  storageBucket:     "avis-flotta.firebasestorage.app",
  messagingSenderId: "508775208428",
  appId:             "1:508775208428:web:f7bfec3df813483d1f1cc9"
};

window._fb = {
  app:   null,
  db:    null,
  sync:  false,
  unsubs: []
};

window.inizializzaFirebase = async function() {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getFirestore, enableIndexedDbPersistence } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

    window._fb.app = initializeApp(_fbConfig);
    window._fb.db  = getFirestore(window._fb.app);

    await enableIndexedDbPersistence(window._fb.db).catch(() => {});

    window._fb.sync = true;
    console.log('[Firebase] Connesso');
    return true;
  } catch (err) {
    console.error('[Firebase] Errore:', err);
    return false;
  }
};

window.fbSyncRecord = async function(collezione, record) {
  if (!window._fb.sync) return;
  try {
    const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const { id, ...dati } = record;
    await setDoc(doc(window._fb.db, collezione, String(id)), {
      ...dati, _aggiornato: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error('[Firebase] Scrittura:', err);
  }
};

window.fbDeleteRecord = async function(collezione, id) {
  if (!window._fb.sync) return;
  try {
    const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    await deleteDoc(doc(window._fb.db, collezione, String(id)));
  } catch (err) {
    console.error('[Firebase] Cancellazione:', err);
  }
};

window.fbStartListener = async function(collezione, dexieTable, onUpdate) {
  if (!window._fb.sync) return;
  try {
    const { collection, query, orderBy, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const q = query(collection(window._fb.db, collezione), orderBy('_aggiornato', 'desc'));
    const unsub = onSnapshot(q, async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        const data = { ...change.doc.data(), id: parseInt(change.doc.id) || change.doc.id };
        delete data._aggiornato;
        if (change.type === 'added' || change.type === 'modified') {
          await dexieTable.put(data).catch(() => {});
        }
        if (change.type === 'removed') {
          await dexieTable.delete(data.id).catch(() => {});
        }
      }
      if (typeof onUpdate === 'function') onUpdate();
    });
    window._fb.unsubs.push(unsub);
  } catch (err) {
    console.error('[Firebase] Listener:', err);
  }
};

window.fbUploadIniziale = async function(tables) {
  if (!window._fb.sync) return;
  for (const [nome, table] of Object.entries(tables)) {
    const records = await table.toArray();
    for (const r of records) await window.fbSyncRecord(nome, r);
    console.log('[Firebase] Upload ' + nome + ': ' + records.length + ' record');
  }
};
