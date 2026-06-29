/* ═══════════════════════════════════════════════════
   AVIS Flotta — db.js
   Livello dati: IndexedDB con Dexie.js (CDN)
   Tutte le operazioni CRUD sui 5 object store
   ═══════════════════════════════════════════════════ */

/* Inizializzazione Dexie */
const db = new Dexie('AvisFlottaDB');

db.version(1).stores({
  veicoli:       '++id, targa, sede, stato',
  rifornimenti:  '++id, veicoloId, data',
  manutenzioni:  '++id, veicoloId, data, tipo',
  segnalazioni:  '++id, veicoloId, stato, priorita, data',
  scadenze:      '++id, veicoloId, tipo, dataScadenza'
});

/* ────────── VEICOLI ────────── */
const Veicoli = {
  async getAll() {
    return db.veicoli.orderBy('targa').toArray();
  },

  async get(id) {
    return db.veicoli.get(id);
  },

  async add(veicolo) {
    const id = await db.veicoli.add({
      ...veicolo,
      dataCreazione: new Date().toISOString(),
      stato: 'attivo'
    });
    await Scadenze.rigenera(id, veicolo);
    return id;
  },

  async update(id, dati) {
    await db.veicoli.update(id, dati);
    const v = await db.veicoli.get(id);
    await Scadenze.rigenera(id, v);
  },

  async elimina(id) {
    await db.transaction('rw', db.veicoli, db.rifornimenti, db.manutenzioni, db.segnalazioni, db.scadenze, async () => {
      await db.veicoli.delete(id);
      await db.rifornimenti.where('veicoloId').equals(id).delete();
      await db.manutenzioni.where('veicoloId').equals(id).delete();
      await db.segnalazioni.where('veicoloId').equals(id).delete();
      await db.scadenze.where('veicoloId').equals(id).delete();
    });
  },

  async getConScadenze() {
    const veicoli = await this.getAll();
    const oggi = new Date();
    return veicoli.map(v => ({
      ...v,
      giorniTagliando:  v.tagliandoData  ? Math.round((new Date(v.tagliandoData) - oggi) / 86400000) : 999,
      giorniBollo:      v.bolloScadenza  ? Math.round((new Date(v.bolloScadenza) - oggi) / 86400000) : 999,
      giorniRevisione:  v.revisioneData  ? Math.round((new Date(v.revisioneData) - oggi) / 86400000) : 999,
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

  async add(dati) {
    const id = await db.rifornimenti.add({
      ...dati,
      dataCreazione: new Date().toISOString()
    });
    // Aggiorna km veicolo se maggiori
    const v = await db.veicoli.get(dati.veicoloId);
    if (v && dati.km > (v.kmAttuali || 0)) {
      await db.veicoli.update(dati.veicoloId, { kmAttuali: dati.km });
    }
    return id;
  },

  async elimina(id) {
    return db.rifornimenti.delete(id);
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

  async add(dati) {
    const id = await db.manutenzioni.add({
      ...dati,
      dataCreazione: new Date().toISOString()
    });
    // Se è un tagliando, aggiorna la data sul veicolo
    if (dati.tipo === 'ordinaria' && dati.prossimoIntervento) {
      await db.veicoli.update(dati.veicoloId, {
        tagliandoData: dati.prossimoIntervento,
        tagliandoKm: dati.prossimoKm || undefined
      });
      await Scadenze.rigenera(dati.veicoloId, await db.veicoli.get(dati.veicoloId));
    }
    return id;
  },

  async elimina(id) {
    return db.manutenzioni.delete(id);
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

  async add(dati) {
    return db.segnalazioni.add({
      ...dati,
      stato: 'aperta',
      dataCreazione: new Date().toISOString()
    });
  },

  async aggiornaSato(id, stato) {
    return db.segnalazioni.update(id, {
      stato,
      dataAggiornamento: new Date().toISOString()
    });
  },

  async elimina(id) {
    return db.segnalazioni.delete(id);
  }
};

/* ────────── SCADENZE ────────── */
const Scadenze = {
  async rigenera(veicoloId, veicolo) {
    await db.scadenze.where('veicoloId').equals(veicoloId).delete();
    const scad = [];
    if (veicolo.tagliandoData) scad.push({ veicoloId, tipo: 'tagliando',  dataScadenza: veicolo.tagliandoData,  descrizione: 'Tagliando' });
    if (veicolo.bolloScadenza)  scad.push({ veicoloId, tipo: 'bollo',      dataScadenza: veicolo.bolloScadenza,  descrizione: 'Bollo auto' });
    if (veicolo.revisioneData)  scad.push({ veicoloId, tipo: 'revisione',  dataScadenza: veicolo.revisioneData,  descrizione: 'Revisione periodica' });
    if (veicolo.assicurazione)  scad.push({ veicoloId, tipo: 'assicurazione', dataScadenza: veicolo.assicurazione, descrizione: 'Assicurazione RCA' });
    await db.scadenze.bulkAdd(scad);
  },

  async prossime(giorni = 60) {
    const limite = new Date();
    limite.setDate(limite.getDate() + giorni);
    const oggi = new Date().toISOString().split('T')[0];
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
  },

  async importaJSON(file) {
    const testo = await file.text();
    const dati = JSON.parse(testo);
    if (!dati.versione || !dati.veicoli) throw new Error('File non valido');

    await db.transaction('rw', db.veicoli, db.rifornimenti, db.manutenzioni, db.segnalazioni, db.scadenze, async () => {
      await db.veicoli.clear();
      await db.rifornimenti.clear();
      await db.manutenzioni.clear();
      await db.segnalazioni.clear();
      await db.scadenze.clear();

      await db.veicoli.bulkAdd(dati.veicoli);
      await db.rifornimenti.bulkAdd(dati.rifornimenti || []);
      await db.manutenzioni.bulkAdd(dati.manutenzioni || []);
      await db.segnalazioni.bulkAdd(dati.segnalazioni || []);

      for (const v of dati.veicoli) {
        await Scadenze.rigenera(v.id, v);
      }
    });
  }
};

/* ────────── DATI DEMO ────────── */
async function caricaDatiDemo() {
  const count = await db.veicoli.count();
  if (count > 0) return;

  const oggi = new Date();
  const fra = (g) => { const d = new Date(oggi); d.setDate(d.getDate() + g); return d.toISOString().split('T')[0]; };

  const veicoli = [
    { targa: 'BS 451 DH', modello: 'Fiat Doblò',      anno: 2020, kmAttuali: 87400, carburante: 'Diesel', sede: 'Brescia',         tagliandoData: fra(-30),  bolloScadenza: fra(185), revisioneData: fra(200), stato: 'attivo' },
    { targa: 'BS 312 KL', modello: 'Ford Transit',     anno: 2019, kmAttuali: 112300, carburante: 'Diesel', sede: 'Cunettone Salò',  tagliandoData: fra(73),   bolloScadenza: fra(18),  revisioneData: fra(174), stato: 'attivo' },
    { targa: 'BS 789 FP', modello: 'Renault Kangoo',   anno: 2021, kmAttuali: 54200,  carburante: 'Diesel', sede: 'Brescia',         tagliandoData: fra(144),  bolloScadenza: fra(397), revisioneData: fra(22),  stato: 'attivo' },
    { targa: 'BS 221 MN', modello: 'VW Caddy',         anno: 2022, kmAttuali: 34100,  carburante: 'Diesel', sede: 'Mobile',          tagliandoData: fra(226),  bolloScadenza: fra(93),  revisioneData: fra(246), stato: 'attivo' },
    { targa: 'BS 100 AX', modello: 'Fiat Fiorino',     anno: 2018, kmAttuali: 98700,  carburante: 'Benzina', sede: 'Brescia',        tagliandoData: fra(159),  bolloScadenza: fra(154), revisioneData: fra(226), stato: 'attivo' },
  ];

  for (const v of veicoli) {
    const id = await db.veicoli.add({ ...v, dataCreazione: new Date().toISOString() });
    await Scadenze.rigenera(id, v);
  }

  await db.rifornimenti.bulkAdd([
    { veicoloId: 4, data: fra(-2),  km: 34100, litri: 42,   costo: 72.24,  carburante: 'Diesel', distributore: 'Agip Brescia Nord', note: '', dataCreazione: new Date().toISOString() },
    { veicoloId: 3, data: fra(-7),  km: 54200, litri: 35,   costo: 60.55,  carburante: 'Diesel', distributore: 'Eni Salò',          note: '', dataCreazione: new Date().toISOString() },
    { veicoloId: 2, data: fra(-11), km: 112300, litri: 65,  costo: 112.40, carburante: 'Diesel', distributore: 'Q8 Brescia Est',    note: 'Autista: Marco', dataCreazione: new Date().toISOString() },
  ]);

  await db.manutenzioni.bulkAdd([
    { veicoloId: 5, tipo: 'ordinaria',    data: fra(-4),  km: 98700,  descrizione: 'Cambio olio 5W30, filtro olio, filtro aria', officina: 'Officina Rossi BS', costo: 185, prossimoIntervento: fra(180), dataCreazione: new Date().toISOString() },
    { veicoloId: 1, tipo: 'straordinaria', data: fra(-19), km: 87000, descrizione: 'Sostituzione ammortizzatori anteriori SX e DX', officina: 'Autofficina Bianchi BS', costo: 420, dataCreazione: new Date().toISOString() },
  ]);

  await db.segnalazioni.bulkAdd([
    { veicoloId: 2, priorita: 'alta',   titolo: 'Spia freni accesa',    descrizione: 'La spia ABS si accende a freddo all\'avvio', segnalato: 'Sergio M.', data: fra(-5), stato: 'aperta',        dataCreazione: new Date().toISOString() },
    { veicoloId: 1, priorita: 'media',  titolo: 'Rumore sospensione',   descrizione: 'Rumore metallico in curva a destra',        segnalato: 'Sara C.',   data: fra(-14), stato: 'in_lavorazione', dataCreazione: new Date().toISOString() },
  ]);

  console.log('[DB] Dati demo caricati');
}
