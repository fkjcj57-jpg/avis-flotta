/* ═══════════════════════════════════════════════════
   AVIS Flotta — auth.js
   Autenticazione Firebase + gestione ruoli
   Ruoli: responsabile | operatore | autista
   ═══════════════════════════════════════════════════ */

window.Auth = {
  utente:  null,   // oggetto Firebase User
  profilo: null,   // { nome, ruolo, email } da Firestore
  pronto:  false,
  _shortcutGestito: false,

  /* ── Inizializza listener autenticazione ── */
  async init() {
    const { getAuth, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const auth = getAuth(window._fb.app);

    return new Promise(resolve => {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          Auth.utente = user;
          Auth.profilo = await Auth._caricaProfilo(user.uid);
        } else {
          Auth.utente  = null;
          Auth.profilo = null;
        }
        Auth.pronto = true;
        resolve(Auth.utente);
        Auth._aggiornaUI();
      });
    });
  },

  /* ── Login con email e password ── */
  async login(email, password) {
    const { getAuth, signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const auth = getAuth(window._fb.app);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  },

  /* ── Logout ── */
  async logout() {
    // Ferma tutti i listener Firestore prima di uscire
    if (window.fermaListener) window.fermaListener();
    const { getAuth, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    await signOut(getAuth(window._fb.app));
    // Reset flag shortcut così al prossimo login non si riaprono modali
    Auth._shortcutGestito = true;
  },

  /* ── Carica profilo utente da Firestore ── */
  async _caricaProfilo(uid) {
    const { getFirestore, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const snap = await getDoc(doc(getFirestore(window._fb.app), 'utenti', uid));
    return snap.exists() ? snap.data() : { nome: 'Utente', ruolo: 'autista', email: '' };
  },

  /* ── Crea nuovo account (solo responsabile) ── */
  async creaUtente(email, password, nome, ruolo) {
    if (!Auth.isResponsabile()) throw new Error('Non autorizzato');

    // Usa una seconda istanza Firebase per non disconnettere il responsabile
    const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getAuth: getAuth2, createUserWithEmailAndPassword, signOut: signOut2 } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const { getFirestore, doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

    const apps = getApps();
    const secondaApp = apps.find(a => a.name === 'secondary') ||
      initializeApp(window._fb.app.options, 'secondary');

    const auth2 = getAuth2(secondaApp);
    const cred  = await createUserWithEmailAndPassword(auth2, email, password);

    // Salva profilo in Firestore
    await setDoc(doc(getFirestore(window._fb.app), 'utenti', cred.user.uid), {
      nome,
      ruolo,
      email,
      creato: new Date().toISOString(),
      creadaDa: Auth.utente.uid
    });

    await signOut2(auth2);
    return cred.user;
  },

  /* ── Elimina utente (solo responsabile) ── */
  async eliminaUtente(uid) {
    if (!Auth.isResponsabile()) throw new Error('Non autorizzato');
    const { getFirestore, doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    await deleteDoc(doc(getFirestore(window._fb.app), 'utenti', uid));
    // Nota: l'eliminazione dell'account Auth richiede una Cloud Function
    // Per ora disabilita l'accesso rimuovendo il profilo Firestore
  },

  /* ── Lista utenti (solo responsabile) ── */
  async listaUtenti() {
    if (!Auth.isResponsabile()) return [];
    const { getFirestore, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const snap = await getDocs(collection(getFirestore(window._fb.app), 'utenti'));
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  },

  /* ── Cambio password utente corrente ── */
  async cambiaPassword(nuovaPassword) {
    const { getAuth, updatePassword } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    await updatePassword(getAuth(window._fb.app).currentUser, nuovaPassword);
  },

  /* ── Controlli ruolo ── */
  isResponsabile() { return Auth.profilo?.ruolo === 'responsabile'; },
  isOperatore()    { return Auth.profilo?.ruolo === 'operatore' || Auth.isResponsabile(); },
  isAutista()      { return !!Auth.profilo; },
  nomeUtente()     { return Auth.profilo?.nome || 'Utente'; },
  ruoloUtente()    { return Auth.profilo?.ruolo || 'autista'; },

  /* ── Aggiorna UI in base al ruolo (idempotente) ── */
  async _aggiornaUI() {
    // PRIMA COSA: ripristina sempre la nav a stato pulito
    // (rimuove le classi hidden aggiunte da login precedenti)
    document.querySelectorAll('.nav-item').forEach(el => {
      if (el.dataset.ruolo !== 'responsabile') el.classList.remove('hidden');
    });

    if (!Auth.utente) {
      // Non loggato: mostra login, nascondi app
      document.getElementById('schermata-login')?.classList.remove('hidden');
      document.getElementById('app')?.classList.add('hidden');
      // Ripristina pulsante login
      const btn = document.querySelector('#schermata-login .btn-primary');
      if (btn) { btn.innerHTML = '<i class="ti ti-login"></i> Accedi'; btn.disabled = false; }
      return;
    }

    // Loggato: nascondi login, mostra app
    document.getElementById('schermata-login')?.classList.add('hidden');
    document.getElementById('app')?.classList.remove('hidden');

    // Nome e ruolo in topbar
    const nomeEl = document.getElementById('topbar-nome');
    if (nomeEl) nomeEl.textContent = Auth.nomeUtente();
    const ruoloEl = document.getElementById('topbar-ruolo');
    if (ruoloEl) ruoloEl.textContent = Auth.ruoloUtente();

    // Mostra/nascondi elementi per ruolo
    document.querySelectorAll('[data-ruolo="responsabile"]').forEach(el => {
      el.classList.toggle('hidden', !Auth.isResponsabile());
    });
    document.querySelectorAll('[data-ruolo="operatore"]').forEach(el => {
      el.classList.toggle('hidden', !Auth.isOperatore());
    });

    // Autista: nascondi tutte le voci nav tranne segnalazioni
    if (Auth.ruoloUtente() === 'autista') {
      document.querySelectorAll('.nav-item:not([data-page="segnalazioni"])').forEach(el => {
        el.classList.add('hidden');
      });
    }

    // Avvia listener Firestore (ora l'utente è autenticato)
    if (window.avviaListener) {
      try { await avviaListener(); } catch (e) { console.warn('[Listener]', e); }
    }

    // Carica dati e naviga — SEMPRE, ad ogni login
    try { await caricaDatiDemo(); } catch (e) { console.warn('[Demo]', e); }

    const params = new URLSearchParams(location.search);
    const pagina = (Auth.ruoloUtente() === 'autista')
      ? 'segnalazioni'
      : (params.get('p') || 'dashboard');
    if (window.navigate) navigate(pagina);

    // Gestisci shortcut da manifest (solo primo caricamento)
    if (!Auth._shortcutGestito) {
      Auth._shortcutGestito = true;
      const action = params.get('action');
      if (action === 'rifornimento') setTimeout(() => window.openModalRifornimento?.(), 300);
      if (action === 'segnalazione') setTimeout(() => window.openModalSegnalazione?.(), 300);
    }
  }
};
