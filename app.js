/* ═══════════════════════════════════════════════════
   AVIS Flotta PWA — app.js
   Logica UI: navigazione, rendering, modali, form
   ═══════════════════════════════════════════════════ */

/* ── Stato globale ── */
const State = {
  paginaCorrente: 'dashboard',
  filtroVeicoli:     'tutti',
  filtroManutenzioni:'tutti',
  filtroSegnalazioni:'tutte',
  deferredInstall: null,
};

/* ── Utilità date ── */
const fmt = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const oggi = () => new Date().toISOString().split('T')[0];

const giorniA = (iso) => {
  if (!iso) return 999;
  return Math.round((new Date(iso) - new Date()) / 86400000);
};

const scadClasse = (giorni) => {
  if (giorni < 0)  return 'danger';
  if (giorni < 30) return 'warn';
  return 'ok';
};

const scadTag = (giorni, data) => {
  if (giorni < 0)  return `<span class="tag tag-danger">Scaduto ${Math.abs(giorni)} gg fa</span>`;
  if (giorni < 30) return `<span class="tag tag-warn">tra ${giorni} gg</span>`;
  return `<span class="tag tag-ok">${fmt(data)}</span>`;
};

const euro = (n) => `€ ${(+n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

/* ── Navigazione ── */
function navigate(pagina) {
  State.paginaCorrente = pagina;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${pagina}`)?.classList.add('active');
  document.querySelector(`[data-page="${pagina}"]`)?.classList.add('active');
  renderPagina(pagina);
  // Aggiorna URL per deeplinking
  history.replaceState({ pagina }, '', `?p=${pagina}`);
}

async function renderPagina(pagina) {
  switch (pagina) {
    case 'dashboard':     return renderDashboard();
    case 'veicoli':       return renderVeicoli();
    case 'rifornimenti':  return renderRifornimenti();
    case 'manutenzioni':  return renderManutenzioni();
    case 'segnalazioni':  return renderSegnalazioni();
  }
}

/* ── Dashboard ── */
async function renderDashboard() {
  const [veicoli, rifStat, mantStat, segnAperte, scadProssime] = await Promise.all([
    Veicoli.getConScadenze(),
    Rifornimenti.statistiche(1),
    Manutenzioni.statistiche(),
    Segnalazioni.getAperte(),
    Scadenze.prossime(60),
  ]);

  const scadute  = veicoli.filter(v => v.statoScadenze === 'scaduto').length;
  const warning  = veicoli.filter(v => v.statoScadenze === 'warning').length;
  const costoMese = rifStat.totCosto + 0; // da integrare con manutenzioni mese

  // Stats
  document.getElementById('dash-veicoli').textContent   = veicoli.length;
  document.getElementById('dash-scadenze').textContent  = scadute + warning;
  document.getElementById('dash-guasti').textContent    = segnAperte.length;
  document.getElementById('dash-costo').textContent     = `€ ${Math.round(costoMese)}`;

  // Aggiorna badge notifiche
  const totalAlert = scadute + warning + segnAperte.length;
  const badge = document.getElementById('notif-badge');
  badge.textContent = totalAlert;
  badge.classList.toggle('visible', totalAlert > 0);

  // Alert scadenze
  const alertContainer = document.getElementById('dash-alerts');
  const alerts = scadProssime.filter(s => s.giorni < 30);
  if (alerts.length === 0) {
    alertContainer.innerHTML = '<div class="alert alert-ok"><i class="ti ti-circle-check"></i><div>Nessuna scadenza urgente nei prossimi 30 giorni.</div></div>';
  } else {
    alertContainer.innerHTML = alerts.map(s => {
      const v = veicoli.find(v => v.id === s.veicoloId);
      const cls = s.giorni < 0 ? 'danger' : 'warn';
      const icon = cls === 'danger' ? 'ti-alert-circle' : 'ti-clock';
      const testo = s.giorni < 0
        ? `<strong>${s.descrizione} scaduto</strong> — ${v?.targa} ${v?.modello}. ${Math.abs(s.giorni)} giorni fa.`
        : `<strong>${s.descrizione} in scadenza</strong> — ${v?.targa} ${v?.modello} tra ${s.giorni} giorni (${fmt(s.dataScadenza)}).`;
      return `<div class="alert alert-${cls}"><i class="ti ${icon}"></i><div>${testo}</div></div>`;
    }).join('');
  }

  // Ultime attività (mix rifornimenti + manutenzioni + segnalazioni)
  const [rif, mant, segn] = await Promise.all([
    Rifornimenti.getAll(), Manutenzioni.getAll(), Segnalazioni.getAll()
  ]);

  const attivita = [
    ...rif.slice(0, 3).map(r => ({ tipo: 'rif',  data: r.data, r })),
    ...mant.slice(0, 3).map(m => ({ tipo: 'mant', data: m.data, m })),
    ...segn.slice(0, 3).map(s => ({ tipo: 'segn', data: s.data, s })),
  ].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 6);

  const getVnome = (id) => {
    const v = veicoli.find(v => v.id === id);
    return v ? `${v.targa} — ${v.modello}` : '—';
  };

  document.getElementById('dash-attivita').innerHTML = attivita.length ? attivita.map(a => {
    if (a.tipo === 'rif')  return `<div class="tl-item"><div class="tl-icon tl-icon-fuel"><i class="ti ti-droplet"></i></div><div class="tl-body"><div class="tl-title">${getVnome(a.r.veicoloId)}</div><div class="tl-meta">${a.r.litri} L · ${a.r.carburante} · ${fmt(a.r.data)}</div></div><div class="tl-right"><div class="tl-cost">${euro(a.r.costo)}</div></div></div>`;
    if (a.tipo === 'mant') return `<div class="tl-item"><div class="tl-icon tl-icon-maint"><i class="ti ti-tool"></i></div><div class="tl-body"><div class="tl-title">${getVnome(a.m.veicoloId)}</div><div class="tl-meta">${a.m.descrizione?.substring(0,40)}... · ${fmt(a.m.data)}</div></div><div class="tl-right"><div class="tl-cost">${euro(a.m.costo)}</div></div></div>`;
    if (a.tipo === 'segn') return `<div class="tl-item"><div class="tl-icon tl-icon-signal"><i class="ti ti-alert-triangle"></i></div><div class="tl-body"><div class="tl-title">${a.s.titolo}</div><div class="tl-meta">${getVnome(a.s.veicoloId)} · ${fmt(a.s.data)}</div></div><div class="tl-right"><span class="tag tag-${a.s.stato==='aperta'?'danger':a.s.stato==='in_lavorazione'?'warn':'ok'}">${a.s.stato.replace('_',' ')}</span></div></div>`;
  }).join('') : '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:14px">Nessuna attività registrata</div>';
}

/* ── Veicoli ── */
async function renderVeicoli() {
  let veicoli = await Veicoli.getConScadenze();
  if (State.filtroVeicoli === 'ok')      veicoli = veicoli.filter(v => v.statoScadenze === 'ok');
  if (State.filtroVeicoli === 'warning') veicoli = veicoli.filter(v => v.statoScadenze === 'warning');
  if (State.filtroVeicoli === 'scaduto') veicoli = veicoli.filter(v => v.statoScadenze === 'scaduto');

  const container = document.getElementById('veicoli-list');
  if (!veicoli.length) {
    container.innerHTML = `<div class="empty-state"><i class="ti ti-car-off"></i><h3>Nessun veicolo trovato</h3><p>Prova a cambiare filtro o aggiungi un veicolo.</p></div>`;
    return;
  }

  container.innerHTML = veicoli.map(v => {
    const colore = { ok: '#3B6D11', warning: '#854F0B', scaduto: '#A32D2D' }[v.statoScadenze];
    return `<div class="card">
      <div class="car-row">
        <div class="car-icon"><i class="ti ti-car"></i></div>
        <div class="flex-1">
          <div class="car-title">${v.modello} <span class="text-muted" style="font-weight:400;font-size:13px">${v.targa}</span></div>
          <div class="car-sub">${v.anno} · ${v.carburante} · ${(v.kmAttuali||0).toLocaleString('it')} km · ${v.sede}</div>
        </div>
        <div class="status-dot" style="background:${colore}"></div>
      </div>
      <div class="scad-rows">
        <div class="scad-row"><span class="scad-label"><i class="ti ti-tool"></i> Tagliando</span>${scadTag(v.giorniTagliando, v.tagliandoData)}</div>
        <div class="scad-row"><span class="scad-label"><i class="ti ti-receipt"></i> Bollo</span>${scadTag(v.giorniBollo, v.bolloScadenza)}</div>
        <div class="scad-row"><span class="scad-label"><i class="ti ti-clipboard-check"></i> Revisione</span>${scadTag(v.giorniRevisione, v.revisioneData)}</div>
      </div>
      <div class="flex gap-8 mt-8">
        <button class="btn btn-secondary btn-sm" onclick="openModalVeicolo(${v.id})"><i class="ti ti-edit"></i> Modifica</button>
        <button class="btn btn-secondary btn-sm" onclick="eliminaVeicolo(${v.id})"><i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

/* ── Rifornimenti ── */
async function renderRifornimenti() {
  const [rifornimenti, veicoli, stat] = await Promise.all([
    Rifornimenti.getAll(),
    Veicoli.getAll(),
    Rifornimenti.statistiche(12)
  ]);

  document.getElementById('rif-litri').textContent = `${Math.round(stat.totLitri)} L`;
  document.getElementById('rif-costo').textContent = `€ ${Math.round(stat.totCosto)}`;
  document.getElementById('rif-num').textContent   = stat.numRifornimenti;

  const getV = id => veicoli.find(v => v.id === id);
  const container = document.getElementById('rif-list');

  if (!rifornimenti.length) {
    container.innerHTML = `<div class="empty-state"><i class="ti ti-droplet-off"></i><h3>Nessun rifornimento</h3><p>Registra il primo rifornimento.</p></div>`;
    return;
  }

  container.innerHTML = rifornimenti.map(r => {
    const v = getV(r.veicoloId);
    return `<div class="card">
      <div class="tl-item" style="padding:0;border:none">
        <div class="tl-icon tl-icon-fuel"><i class="ti ti-droplet"></i></div>
        <div class="tl-body">
          <div class="tl-title">${v ? `${v.targa} — ${v.modello}` : '—'}</div>
          <div class="tl-meta">${fmt(r.data)} · ${r.distributore || '—'}${r.km ? ' · ' + r.km.toLocaleString('it') + ' km' : ''}</div>
          ${r.note ? `<div class="text-sm text-muted mt-8">${r.note}</div>` : ''}
        </div>
        <div class="tl-right">
          <div class="tl-cost">${euro(r.costo)}</div>
          <div class="tl-unit">${r.litri} L</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ── Manutenzioni ── */
async function renderManutenzioni() {
  let [manutenzioni, veicoli, stat] = await Promise.all([
    Manutenzioni.getAll(),
    Veicoli.getAll(),
    Manutenzioni.statistiche()
  ]);

  if (State.filtroManutenzioni !== 'tutti') {
    manutenzioni = manutenzioni.filter(m => m.tipo === State.filtroManutenzioni);
  }

  document.getElementById('mant-costo').textContent = `€ ${Math.round(stat.totCosto)}`;
  document.getElementById('mant-num').textContent   = stat.numInterventi;

  const getV = id => veicoli.find(v => v.id === id);
  const container = document.getElementById('mant-list');

  if (!manutenzioni.length) {
    container.innerHTML = `<div class="empty-state"><i class="ti ti-tool-off"></i><h3>Nessun intervento</h3><p>Registra il primo intervento.</p></div>`;
    return;
  }

  container.innerHTML = manutenzioni.map(m => {
    const v = getV(m.veicoloId);
    const iconClass = m.tipo === 'ordinaria' ? 'tl-icon-maint' : 'tl-icon-signal';
    return `<div class="card">
      <div class="tl-item" style="padding:0;border:none">
        <div class="tl-icon ${iconClass}"><i class="ti ti-tool"></i></div>
        <div class="tl-body">
          <div class="tl-title">${v ? `${v.targa} — ${v.modello}` : '—'}</div>
          <div class="tl-meta">${fmt(m.data)} · ${m.officina || '—'}</div>
          <div class="text-sm mt-8">${m.descrizione || ''}</div>
          ${m.prossimoIntervento ? `<div class="text-xs text-muted mt-8">Prossimo: ${fmt(m.prossimoIntervento)}</div>` : ''}
        </div>
        <div class="tl-right">
          <div class="tl-cost">${euro(m.costo)}</div>
          <span class="tag tag-${m.tipo === 'ordinaria' ? 'blue' : 'warn'}" style="margin-top:4px">${m.tipo}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ── Segnalazioni ── */
async function renderSegnalazioni() {
  let [segnalazioni, veicoli] = await Promise.all([
    Segnalazioni.getAll(),
    Veicoli.getAll()
  ]);

  if (State.filtroSegnalazioni !== 'tutte') {
    segnalazioni = segnalazioni.filter(s => s.stato === State.filtroSegnalazioni);
  }

  const getV = id => veicoli.find(v => v.id === id);
  const container = document.getElementById('segn-list');

  if (!segnalazioni.length) {
    container.innerHTML = `<div class="empty-state"><i class="ti ti-mood-happy"></i><h3>Nessuna segnalazione</h3><p>Ottimo! Tutto sotto controllo.</p></div>`;
    return;
  }

  const statoTag = { aperta: 'danger', in_lavorazione: 'warn', chiusa: 'ok' };
  const prioTag  = { alta: 'danger', media: 'warn', bassa: 'blue' };

  container.innerHTML = segnalazioni.map(s => {
    const v = getV(s.veicoloId);
    return `<div class="card">
      <div class="flex gap-8 items-center" style="margin-bottom:8px">
        <div class="tl-icon tl-icon-signal"><i class="ti ti-alert-triangle"></i></div>
        <div class="flex-1">
          <div class="tl-title">${s.titolo}</div>
          <div class="tl-meta">${v ? `${v.targa} — ${v.modello}` : '—'} · ${fmt(s.data)}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
          <span class="tag tag-${statoTag[s.stato]}">${s.stato.replace('_', ' ')}</span>
          <span class="tag tag-${prioTag[s.priorita]}">${s.priorita}</span>
        </div>
      </div>
      <div class="text-sm text-muted">${s.descrizione || ''}</div>
      <div class="text-xs text-muted mt-8">Segnalato da: ${s.segnalato || '—'}</div>
      ${s.stato !== 'chiusa' ? `
        <div class="flex gap-8 mt-8">
          ${s.stato === 'aperta' ? `<button class="btn btn-secondary btn-sm" onclick="aggiornaSegnalazione(${s.id},'in_lavorazione')">Prendi in carico</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="aggiornaSegnalazione(${s.id},'chiusa')">Chiudi</button>
        </div>` : ''}
    </div>`;
  }).join('');
}

/* ── Form: Veicolo ── */
async function openModalVeicolo(id = null) {
  const modal = document.getElementById('modal-veicolo');
  const form  = document.getElementById('form-veicolo');
  document.getElementById('modal-veicolo-title').textContent = id ? 'Modifica veicolo' : 'Aggiungi veicolo';
  form.reset();
  form.dataset.id = id || '';

  if (id) {
    const v = await Veicoli.get(id);
    if (v) {
      ['targa','modello','anno','kmAttuali','carburante','sede',
       'tagliandoData','tagliandoKm','bolloScadenza','revisioneData','assicurazione','note'].forEach(k => {
        const el = document.getElementById(`v-${k}`);
        if (el) el.value = v[k] || '';
      });
    }
  }

  openModal('modal-veicolo');
}

async function salvaVeicolo() {
  const form = document.getElementById('form-veicolo');
  const id = form.dataset.id;
  const targa = document.getElementById('v-targa').value.trim();
  if (!targa) { showToast('Inserisci la targa', 'danger'); return; }

  const dati = {
    targa:        targa.toUpperCase(),
    modello:      document.getElementById('v-modello').value,
    anno:         +document.getElementById('v-anno').value || new Date().getFullYear(),
    kmAttuali:    +document.getElementById('v-kmAttuali').value || 0,
    carburante:   document.getElementById('v-carburante').value,
    sede:         document.getElementById('v-sede').value,
    tagliandoData: document.getElementById('v-tagliandoData').value,
    tagliandoKm:   +document.getElementById('v-tagliandoKm').value || 0,
    bolloScadenza: document.getElementById('v-bolloScadenza').value,
    revisioneData: document.getElementById('v-revisioneData').value,
    assicurazione: document.getElementById('v-assicurazione').value,
    note:          document.getElementById('v-note').value,
  };

  if (id) {
    await Veicoli.update(+id, dati);
    showToast('Veicolo aggiornato', 'ok');
  } else {
    await Veicoli.add(dati);
    showToast('Veicolo aggiunto', 'ok');
  }

  closeModal('modal-veicolo');
  renderPagina(State.paginaCorrente);
}

async function eliminaVeicolo(id) {
  if (!confirm('Eliminare questo veicolo e tutti i dati associati?')) return;
  await Veicoli.elimina(id);
  showToast('Veicolo eliminato', 'warn');
  renderVeicoli();
}

/* ── Form: Rifornimento ── */
async function openModalRifornimento() {
  await popolaSelectVeicoli('r-veicoloId');
  document.getElementById('form-rifornimento').reset();
  document.getElementById('r-data').value = oggi();
  openModal('modal-rifornimento');
}

async function salvaRifornimento() {
  const vId = +document.getElementById('r-veicoloId').value;
  const litri = +document.getElementById('r-litri').value;
  if (!vId || !litri) { showToast('Compila i campi obbligatori', 'danger'); return; }

  await Rifornimenti.add({
    veicoloId:    vId,
    data:         document.getElementById('r-data').value,
    km:           +document.getElementById('r-km').value || 0,
    litri,
    costo:        +document.getElementById('r-costo').value || 0,
    carburante:   document.getElementById('r-carburante').value,
    distributore: document.getElementById('r-distributore').value,
    note:         document.getElementById('r-note').value,
  });

  showToast('Rifornimento registrato', 'ok');
  closeModal('modal-rifornimento');
  if (State.paginaCorrente === 'rifornimenti') renderRifornimenti();
  if (State.paginaCorrente === 'dashboard')    renderDashboard();
}

/* ── Form: Manutenzione ── */
async function openModalManutenzione() {
  await popolaSelectVeicoli('m-veicoloId');
  document.getElementById('form-manutenzione').reset();
  document.getElementById('m-data').value = oggi();
  openModal('modal-manutenzione');
}

async function salvaManutenzione() {
  const vId = +document.getElementById('m-veicoloId').value;
  const desc = document.getElementById('m-descrizione').value.trim();
  if (!vId || !desc) { showToast('Compila i campi obbligatori', 'danger'); return; }

  await Manutenzioni.add({
    veicoloId:         vId,
    tipo:              document.getElementById('m-tipo').value,
    data:              document.getElementById('m-data').value,
    km:                +document.getElementById('m-km').value || 0,
    descrizione:       desc,
    officina:          document.getElementById('m-officina').value,
    costo:             +document.getElementById('m-costo').value || 0,
    prossimoIntervento:document.getElementById('m-prossimoIntervento').value,
    prossimoKm:        +document.getElementById('m-prossimoKm').value || 0,
    note:              document.getElementById('m-note').value,
  });

  showToast('Intervento registrato', 'ok');
  closeModal('modal-manutenzione');
  if (State.paginaCorrente === 'manutenzioni') renderManutenzioni();
  if (State.paginaCorrente === 'dashboard')    renderDashboard();
}

/* ── Form: Segnalazione ── */
async function openModalSegnalazione() {
  await popolaSelectVeicoli('sg-veicoloId');
  document.getElementById('form-segnalazione').reset();
  document.getElementById('sg-data').value = oggi();
  openModal('modal-segnalazione');
}

async function salvaSegnalazione() {
  const vId = +document.getElementById('sg-veicoloId').value;
  const titolo = document.getElementById('sg-titolo').value.trim();
  if (!vId || !titolo) { showToast('Compila i campi obbligatori', 'danger'); return; }

  await Segnalazioni.add({
    veicoloId:   vId,
    priorita:    document.getElementById('sg-priorita').value,
    titolo,
    descrizione: document.getElementById('sg-descrizione').value,
    segnalato:   document.getElementById('sg-segnalato').value,
    data:        document.getElementById('sg-data').value,
  });

  showToast('Segnalazione inviata', 'ok');
  closeModal('modal-segnalazione');
  renderPagina(State.paginaCorrente);
}

/* ── Aggiorna stato segnalazione ── */
async function aggiornaSegnalazione(id, stato) {
  await Segnalazioni.aggiornaSato(id, stato);
  const label = { in_lavorazione: 'Presa in carico', chiusa: 'Chiusa' };
  showToast(`Segnalazione: ${label[stato]}`, 'ok');
  renderSegnalazioni();
  renderDashboard();
}

/* ── Helpers ── */
async function popolaSelectVeicoli(selectId) {
  const veicoli = await Veicoli.getAll();
  const sel = document.getElementById(selectId);
  sel.innerHTML = veicoli.length
    ? veicoli.map(v => `<option value="${v.id}">${v.targa} — ${v.modello}</option>`).join('')
    : '<option value="">Nessun veicolo</option>';
}

function openModal(id) {
  const overlay = document.getElementById(id);
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function setFiltro(tipo, valore, el) {
  if (tipo === 'veicoli')     State.filtroVeicoli     = valore;
  if (tipo === 'manutenzioni')State.filtroManutenzioni = valore;
  if (tipo === 'segnalazioni')State.filtroSegnalazioni = valore;
  el.closest('.filter-row').querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderPagina(State.paginaCorrente);
}

function showToast(messaggio, tipo = 'ok') {
  const container = document.getElementById('toast-container');
  const icons = { ok: 'ti-check', danger: 'ti-alert-circle', warn: 'ti-info-circle' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.innerHTML = `<i class="ti ${icons[tipo]}"></i>${messaggio}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3100);
}

/* ── Service Worker & PWA ── */
async function inizializzaPWA() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      console.log('[SW] Registrato:', reg.scope);

      // Controllo aggiornamenti
      reg.addEventListener('updatefound', () => {
        showToast('Aggiornamento disponibile — ricarica per applicarlo', 'warn');
      });
    } catch (err) {
      console.error('[SW] Errore registrazione:', err);
    }
  }

  // Notifiche push
  if ('Notification' in window) {
    const btn = document.getElementById('btn-notifiche');
    if (btn) {
      btn.style.display = Notification.permission === 'granted' ? 'none' : 'flex';
    }
  }

  // Pulsante installa
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    State.deferredInstall = e;
    document.getElementById('install-banner').classList.add('visible');
  });

  window.addEventListener('appinstalled', () => {
    document.getElementById('install-banner').classList.remove('visible');
    showToast('App installata con successo!', 'ok');
  });
}

async function richiediNotifiche() {
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    showToast('Notifiche attivate', 'ok');
    document.getElementById('btn-notifiche')?.setAttribute('style', 'display:none');
  } else {
    showToast('Permesso notifiche negato', 'warn');
  }
}

async function installaApp() {
  if (!State.deferredInstall) return;
  State.deferredInstall.prompt();
  const { outcome } = await State.deferredInstall.userChoice;
  if (outcome === 'accepted') {
    State.deferredInstall = null;
  }
}

/* ── Offline / online ── */
window.addEventListener('offline', () => {
  document.getElementById('offline-bar').classList.add('visible');
});
window.addEventListener('online', () => {
  document.getElementById('offline-bar').classList.remove('visible');
  showToast('Connessione ripristinata', 'ok');
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SYNC' });
  }
});

/* ── Bootstrap ── */
async function init() {
  await caricaDatiDemo();

  // Avvia sync Firebase in background (non blocca la UI)
  avviaSync().catch(err => console.warn('[Sync]', err));

  await inizializzaPWA();

  // Gestisci deeplink
  const params = new URLSearchParams(location.search);
  const pagina = params.get('p') || 'dashboard';
  navigate(pagina);

  // Shortcut da manifest
  const action = params.get('action');
  if (action === 'rifornimento') setTimeout(() => openModalRifornimento(), 300);
  if (action === 'segnalazione') setTimeout(() => openModalSegnalazione(), 300);

  // Chiudi modale cliccando overlay
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
