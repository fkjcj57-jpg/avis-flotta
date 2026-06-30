/* ═══════════════════════════════════════════════════
   AVIS Flotta — db.js  (script classico, no ES modules)
   Dipende da: Dexie (CDN), firebase.js
   ═══════════════════════════════════════════════════ */

const db = new Dexie('AvisFlottaDB');
db.version(1).stores({
  veicoli:       '++id, targa, sede, stato',
  rifornimenti:  '++id, veicoloId, data',
  manutenzioni:  '++id, veicoloId, data, tipo',
  segnalazioni:  '++id, veicoloId, stato, priorita, data',
  scadenze:      '++id, veicoloId, tipo, dataScadenza'
});

/* ── Callback UI aggiornamento remoto ── */
let _onRemoteUpdate = () => {};

/* ── Avvia sincronizzazione Firebase ── */
async function avviaSync() {
  // Solo inizializza Firebase — i listener partono dopo il login
  return await window.inizializzaFirebase();
}

/* ── Avvia i listener Firestore (chiamato dopo il login confermato) ── */
let _listenerAttivi = false;
async function avviaListener() {
  if (!window._fb || !window._fb.sync) return;
  if (_listenerAttivi) return; // evita duplicati

  const flagKey = 'avis_upload_fatto';
  if (!localStorage.getItem(flagKey)) {
    await window.fbUploadIniziale({
      veicoli: db.veicoli, rifornimenti: db.rifornimenti,
      manutenzioni: db.manutenzioni, segnalazioni: db.segnalazioni
    });
    localStorage.setItem(flagKey, '1');
  }

  const refresh = () => {
    if (window.State && window.renderPagina) {
      window.renderPagina(window.State.paginaCorrente);
    }
  };

  window.fbStartListener('veicoli',      db.veicoli,      refresh);
  window.fbStartListener('rifornimenti', db.rifornimenti, refresh);
  window.fbStartListener('manutenzioni', db.manutenzioni, refresh);
  window.fbStartListener('segnalazioni', db.segnalazioni, refresh);
  _listenerAttivi = true;
  console.log('[DB] Listener attivi');
}

/* ── Ferma i listener (chiamato al logout) ── */
function fermaListener() {
  if (window._fb && window._fb.unsubs) {
    window._fb.unsubs.forEach(u => u());
    window._fb.unsubs = [];
  }
  _listenerAttivi = false;
  console.log('[DB] Listener fermati');
}

/* ────────── VEICOLI ────────── */
const Veicoli = {
  async getAll() {
    return db.veicoli.orderBy('targa').toArray();
  },
  async get(id) {
    return db.veicoli.get(id);
  },
  async add(veicolo) {
    const record = { ...veicolo, dataCreazione: new Date().toISOString(), stato: 'attivo' };
    const id = await db.veicoli.add(record);
    await Scadenze.rigenera(id, veicolo);
    window.fbSyncRecord('veicoli', { ...record, id });
    return id;
  },
  async update(id, dati) {
    await db.veicoli.update(id, dati);
    const v = await db.veicoli.get(id);
    await Scadenze.rigenera(id, v);
    window.fbSyncRecord('veicoli', v);
  },
  async elimina(id) {
    await db.transaction('rw', db.veicoli, db.rifornimenti, db.manutenzioni, db.segnalazioni, db.scadenze, async () => {
      await db.veicoli.delete(id);
      await db.rifornimenti.where('veicoloId').equals(id).delete();
      await db.manutenzioni.where('veicoloId').equals(id).delete();
      await db.segnalazioni.where('veicoloId').equals(id).delete();
      await db.scadenze.where('veicoloId').equals(id).delete();
    });
    window.fbDeleteRecord('veicoli', id);
  },
  async getConScadenze() {
    const veicoli = await this.getAll();
    const oggi = new Date();
    return veicoli.map(v => ({
      ...v,
      giorniTagliando: v.tagliandoData ? Math.round((new Date(v.tagliandoData) - oggi) / 86400000) : 999,
      giorniBollo:     v.bolloScadenza ? Math.round((new Date(v.bolloScadenza) - oggi) / 86400000) : 999,
      giorniRevisione: v.revisioneData ? Math.round((new Date(v.revisioneData) - oggi) / 86400000) : 999,
    })).map(v => ({
      ...v,
      statoScadenze: Math.min(v.giorniTagliando, v.giorniBollo, v.giorniRevisione) < 0 ? 'scaduto'
                   : Math.min(v.giorniTagliando, v.giorniBollo, v.giorniRevisione) < 30 ? 'warning'
                   : 'ok'
    }));
  }
};

/* ────────── RIFORNIMENTI ────────── */
const Rifornimenti = {
  async getAll() {
    return db.rifornimenti.orderBy('data').reverse().toArray();
  },
  async getByVeicolo(veicoloId) {
    return db.rifornimenti.where('veicoloId').equals(veicoloId).reverse().sortBy('data');
  },
  async get(id) {
    return db.rifornimenti.get(id);
  },
  async update(id, dati) {
    await db.rifornimenti.update(id, dati);
    const r = await db.rifornimenti.get(id);
    window.fbSyncRecord('rifornimenti', r);
  },
  async add(dati) {
    const record = { ...dati, dataCreazione: new Date().toISOString() };
    const id = await db.rifornimenti.add(record);
    const v = await db.veicoli.get(dati.veicoloId);
    if (v && dati.km > (v.kmAttuali || 0)) {
      await db.veicoli.update(dati.veicoloId, { kmAttuali: dati.km });
      window.fbSyncRecord('veicoli', { ...v, kmAttuali: dati.km });
    }
    window.fbSyncRecord('rifornimenti', { ...record, id });
    return id;
  },
  async elimina(id) {
    await db.rifornimenti.delete(id);
    window.fbDeleteRecord('rifornimenti', id);
  },
  async statistiche(mesi = 12) {
    const da = new Date();
    da.setMonth(da.getMonth() - mesi);
    const tutti = await db.rifornimenti.where('data').aboveOrEqual(da.toISOString().split('T')[0]).toArray();
    return {
      totLitri: tutti.reduce((a, r) => a + (r.litri || 0), 0),
      totCosto: tutti.reduce((a, r) => a + (r.costo || 0), 0),
      numRifornimenti: tutti.length,
      mediaCosto: tutti.length ? tutti.reduce((a, r) => a + (r.costo || 0), 0) / tutti.length : 0
    };
  }
};

/* ────────── MANUTENZIONI ────────── */
const Manutenzioni = {
  async getAll() {
    return db.manutenzioni.orderBy('data').reverse().toArray();
  },
  async getByVeicolo(veicoloId) {
    return db.manutenzioni.where('veicoloId').equals(veicoloId).reverse().sortBy('data');
  },
  async get(id) {
    return db.manutenzioni.get(id);
  },
  async update(id, dati) {
    await db.manutenzioni.update(id, dati);
    const m = await db.manutenzioni.get(id);
    if (m.tipo === 'ordinaria' && m.prossimoIntervento) {
      await db.veicoli.update(m.veicoloId, {
        tagliandoData: m.prossimoIntervento,
        tagliandoKm: m.prossimoKm || undefined
      });
      const v = await db.veicoli.get(m.veicoloId);
      await Scadenze.rigenera(m.veicoloId, v);
      window.fbSyncRecord('veicoli', v);
    }
    window.fbSyncRecord('manutenzioni', m);
  },
  async add(dati) {
    const record = { ...dati, dataCreazione: new Date().toISOString() };
    const id = await db.manutenzioni.add(record);
    if (dati.tipo === 'ordinaria' && dati.prossimoIntervento) {
      await db.veicoli.update(dati.veicoloId, {
        tagliandoData: dati.prossimoIntervento,
        tagliandoKm: dati.prossimoKm || undefined
      });
      const v = await db.veicoli.get(dati.veicoloId);
      await Scadenze.rigenera(dati.veicoloId, v);
      window.fbSyncRecord('veicoli', v);
    }
    window.fbSyncRecord('manutenzioni', { ...record, id });
    return id;
  },
  async elimina(id) {
    await db.manutenzioni.delete(id);
    window.fbDeleteRecord('manutenzioni', id);
  },
  async statistiche() {
    const tutti = await db.manutenzioni.toArray();
    return {
      totCosto: tutti.reduce((a, m) => a + (m.costo || 0), 0),
      numInterventi: tutti.length,
      ordinarie: tutti.filter(m => m.tipo === 'ordinaria').length,
      straordinarie: tutti.filter(m => m.tipo === 'straordinaria').length
    };
  }
};

/* ────────── SEGNALAZIONI ────────── */
const Segnalazioni = {
  async getAll() {
    return db.segnalazioni.orderBy('data').reverse().toArray();
  },
  async getAperte() {
    return db.segnalazioni.where('stato').equals('aperta').reverse().sortBy('data');
  },
  async get(id) {
    return db.segnalazioni.get(id);
  },
  async update(id, dati) {
    await db.segnalazioni.update(id, { ...dati, dataAggiornamento: new Date().toISOString() });
    const s = await db.segnalazioni.get(id);
    window.fbSyncRecord('segnalazioni', s);
  },
  async add(dati) {
    const record = { ...dati, stato: 'aperta', dataCreazione: new Date().toISOString() };
    const id = await db.segnalazioni.add(record);
    window.fbSyncRecord('segnalazioni', { ...record, id });
    return id;
  },
  async aggiornaSato(id, stato) {
    await db.segnalazioni.update(id, { stato, dataAggiornamento: new Date().toISOString() });
    const s = await db.segnalazioni.get(id);
    window.fbSyncRecord('segnalazioni', s);
  },
  async elimina(id) {
    await db.segnalazioni.delete(id);
    window.fbDeleteRecord('segnalazioni', id);
  }
};

/* ────────── SCADENZE ────────── */
const Scadenze = {
  async rigenera(veicoloId, veicolo) {
    await db.scadenze.where('veicoloId').equals(veicoloId).delete();
    const scad = [];
    if (veicolo.tagliandoData) scad.push({ veicoloId, tipo: 'tagliando',     dataScadenza: veicolo.tagliandoData, descrizione: 'Tagliando' });
    if (veicolo.bolloScadenza)  scad.push({ veicoloId, tipo: 'bollo',         dataScadenza: veicolo.bolloScadenza, descrizione: 'Bollo auto' });
    if (veicolo.revisioneData)  scad.push({ veicoloId, tipo: 'revisione',     dataScadenza: veicolo.revisioneData, descrizione: 'Revisione periodica' });
    if (veicolo.assicurazione)  scad.push({ veicoloId, tipo: 'assicurazione', dataScadenza: veicolo.assicurazione, descrizione: 'Assicurazione RCA' });
    if (scad.length) await db.scadenze.bulkAdd(scad);
  },
  async prossime(giorni = 60) {
    const limite = new Date();
    limite.setDate(limite.getDate() + giorni);
    const tutte = await db.scadenze
      .where('dataScadenza').belowOrEqual(limite.toISOString().split('T')[0])
      .toArray();
    return tutte.map(s => ({
      ...s,
      giorni: Math.round((new Date(s.dataScadenza) - new Date()) / 86400000)
    })).sort((a, b) => a.giorni - b.giorni);
  }
};

/* ────────── IMPORT/EXPORT ────────── */
const DataIO = {
  async esportaJSON() {
    const dati = {
      versione: 1,
      esportato: new Date().toISOString(),
      veicoli:      await db.veicoli.toArray(),
      rifornimenti: await db.rifornimenti.toArray(),
      manutenzioni: await db.manutenzioni.toArray(),
      segnalazioni: await db.segnalazioni.toArray(),
    };
    const blob = new Blob([JSON.stringify(dati, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `avis-flotta-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
};

/* ────────── DATI DEMO ──────────
   Rimossi definitivamente (Giugno 2026): la flotta reale è ora censita
   nell'app. Questa funzione resta come no-op per compatibilità con il
   fallback di app.js (avvio senza Firebase, es. sviluppo locale) ma non
   inserisce più alcun dato fittizio, così da escludere ogni rischio di
   ricomparsa accidentale dei veicoli/rifornimenti/manutenzioni/segnalazioni
   di esempio. */
async function caricaDatiDemo() {
  console.log('[DB] Nessun dato demo da caricare (funzione disattivata)');
}

/* ── Esponi tutto su window così app.js li trova ── */
window.Veicoli        = Veicoli;
window.Rifornimenti   = Rifornimenti;
window.Manutenzioni   = Manutenzioni;
window.Segnalazioni   = Segnalazioni;
window.Scadenze       = Scadenze;
window.DataIO         = DataIO;
window.caricaDatiDemo = caricaDatiDemo;
window.avviaSync      = avviaSync;
window.avviaListener  = avviaListener;
window.fermaListener  = fermaListener;
