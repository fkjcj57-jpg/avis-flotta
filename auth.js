/* ═══════════════════════════════════════════════════
   AVIS Flotta — auth.js
   Autenticazione Firebase + gestione ruoli
   Ruoli: responsabile | operatore | autista
   ═══════════════════════════════════════════════════ */

window.Auth = {
  utente:  null,   // oggetto Firebase User
  profilo: null,   // { nome, ruolo, email } da Firestore
  pronto:  false,

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
    const { getAuth, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    await signOut(getAuth(window._fb.app));
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

  /* ── Aggiorna UI in base al ruolo ── */
  _aggiornaUI() {
    if (!Auth.utente) {
      // Mostra login, nascondi app
      document.getElementById('schermata-login')?.classList.remove('hidden');
      document.getElementById('app')?.classList.add('hidden');
      return;
    }

    // Utente loggato: nascondi login, mostra app
    document.getElementById('schermata-login')?.classList.add('hidden');
    document.getElementById('app')?.classList.remove('hidden');

    // Nome e ruolo in topbar
    const nomeEl = document.getElementById('topbar-nome');
    if (nomeEl) nomeEl.textContent = Auth.nomeUtente();
    const ruoloEl = document.getElementById('topbar-ruolo');
    if (ruoloEl) ruoloEl.textContent = Auth.ruoloUtente();

    // Nascondi elementi in base al ruolo
    document.querySelectorAll('[data-ruolo="responsabile"]').forEach(el => {
      el.classList.toggle('hidden', !Auth.isResponsabile());
    });
    document.querySelectorAll('[data-ruolo="operatore"]').forEach(el => {
      el.classList.toggle('hidden', !Auth.isOperatore());
    });

    // Autista: nascondi tutto tranne segnalazioni
    if (Auth.ruoloUtente() === 'autista') {
      document.querySelectorAll('.nav-item:not([data-page="segnalazioni"])').forEach(el => {
        el.classList.add('hidden');
      });
    }

    // Avvia il caricamento dati e la navigazione (solo al primo login)
    if (window._avviaApp) {
      // Prima avvia i listener Firestore (ora l'utente è autenticato)
      if (window.avviaListener) avviaListener().catch(console.warn);
      window._avviaApp();
      window._avviaApp = null; // esegui una sola volta
    }
  }
};
