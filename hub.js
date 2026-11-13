/* Shared account layer for the Helpers interactive books: session, Google sign-in, username, header and settings.
   Load fb.js before this file. */
(() => {
  const ROOT = new URL('.', document.currentScript.src).href, KEY = 'helpers.session';
  const $ = s => document.querySelector(s), esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const read = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && s.mode ? s : null; } catch (e){ return null; } };
  const write = s => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch (e){} };
  const inApp = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|; wv\)/i.test(navigator.userAgent);
  const Hub = window.Hub = {
    ROOT, session: read(), ready: false, err: '', subs: [], _api: null, _ref: null, _m: (read() ? read().mode : '') + '|',
    emit(){ this.subs.forEach(f => { try { f(this.session); } catch (e){} }); paintWho(); const m = (this.session ? this.session.mode : '') + '|' + this.err, d = $('#hubdlg'); if (m !== this._m){ this._m = m; if (d && !d.hidden) this.session ? this.settings() : (d.hidden = true); } },
    label(){ const s = this.session; return !s ? '' : s.nick || (s.mode === 'user' ? (s.name || 'Signed in').split(' ')[0] : 'Guest'); },
    guest(){ this.session = {mode: 'guest', nick: ''}; write(this.session); this.emit(); },
    async init(){
      if (!window.FB_CONFIG){ this.ready = true; return this.emit(); }
      try {
        const B = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-', [A, U, F] = await Promise.all([import(B + 'app.js'), import(B + 'auth.js'), import(B + 'firestore.js')]);
        const app = A.initializeApp(window.FB_CONFIG), auth = U.getAuth(app), db = F.getFirestore(app); this._api = {U, F, auth, db};
        U.onAuthStateChanged(auth, async u => {
          if (u){
            const old = this.session || {}; this.session = {mode: 'user', uid: u.uid, name: u.displayName || '', email: u.email || '', nick: old.uid === u.uid || old.mode === 'guest' ? old.nick || '' : ''}; write(this.session);
            this._ref = F.doc(db, 'progress', u.uid);
            try { const d = await F.getDoc(this._ref), D = d.exists() ? d.data() : {}, cloud = D.nick; this.hide = !!D.hide;
              if (cloud){ this.session.nick = cloud; write(this.session); this.claim(cloud); } else if (this.session.nick) this.setNick(this.session.nick).catch(() => {}); } catch (e){}
          } else if (this.session && this.session.mode === 'user'){ this.session = null; write(null); }
          this.ready = true; this.emit();
        });
      } catch (e){ this.err = 'Could not reach the sign-in service. Check your connection.'; this.ready = true; this.emit(); }
    },
    signIn(){
      const {U, auth} = this._api || {}; if (!U){ this.err = 'Sign-in is still loading. Try again in a moment.'; return this.emit(); }
      const p = new U.GoogleAuthProvider(); this.err = '';
      U.signInWithPopup(auth, p).catch(e => { if (/popup-blocked|operation-not-supported/.test(e.code || '')) U.signInWithRedirect(auth, p); else if (!/closed-by-user|cancelled/.test(e.code || '')){ this.err = 'Sign-in problem: ' + (e.code || e); this.emit(); } });
    },
    async signOut(){ const {U, auth} = this._api || {}; this.session = null; write(null); try { if (U) await U.signOut(auth); } catch (e){} location.href = ROOT; },
    leave(){ this.session = null; write(null); location.href = ROOT; },
    /* username: 3 to 20 letters, numbers, spaces, dots, dashes or underscores */
    checkNick(n){ n = String(n || '').trim().replace(/\s+/g, ' '); return /^[\p{L}\p{N} ._-]{3,20}$/u.test(n) ? n : null; },
    /* usernames are unique: names/{lowercase name} holds the owner's user id */
    async reserve(n, old){
      const {F, db} = this._api, uid = this.session.uid, lc = n.toLowerCase(), olc = (old || '').toLowerCase();
      try {
        await F.runTransaction(db, async tx => {
          const r = F.doc(db, 'names', lc), s = await tx.get(r), o = olc && olc !== lc ? F.doc(db, 'names', olc) : null, so = o ? await tx.get(o) : null;
          if (s.exists() && s.data().uid !== uid){ const e = new Error('taken'); e.code = 'taken'; throw e; }
          if (!s.exists()) tx.set(r, {uid, t: Date.now()});
          if (so && so.exists() && so.data().uid === uid) tx.delete(o);
        });
      } catch (e){ if (e.code === 'taken') throw e; if (!/permission|invalid-argument/.test(e.code || '')) throw e; }   // rules not published yet: carry on without the check
    },
    claim(n){ const k = 'helpers.claimed', v = this.session.uid + '|' + n; try { if (localStorage.getItem(k) === v) return; } catch (e){} this.reserve(n).then(() => { try { localStorage.setItem(k, v); } catch (e){} }, () => {}); },
    async setNick(n){
      n = this.checkNick(n); if (!n || !this.session) return false;
      if (this.session.mode === 'user' && this._ref){
        const {F} = this._api, old = this.session.nick;
        if ((old || '').toLowerCase() !== n.toLowerCase() || !old) await this.reserve(n, old);
        await F.setDoc(this._ref, {nick: n, name: this.session.name, email: this.session.email, seen: Date.now()}, {merge: true});
        try { localStorage.setItem('helpers.claimed', this.session.uid + '|' + n); } catch (e){}
      }
      this.session.nick = n; write(this.session); this.emit(); return true;
    },
    async setHide(h){
      if (!this.session || this.session.mode !== 'user' || !this._ref) return;
      const {F, db} = this._api; this.hide = h;
      await F.setDoc(this._ref, {hide: h}, {merge: true});
      if (h){ try { await F.deleteDoc(F.doc(db, 'board', this.session.uid)); } catch (e){} try { localStorage.removeItem('helpers.board.' + this.session.uid); } catch (e){} }
      else { try { localStorage.removeItem('helpers.board.' + this.session.uid); } catch (e){} }
    },
    require(){ if (!this.session) location.replace(ROOT + '?next=' + encodeURIComponent(location.href)); return !!this.session; },
    /* header: crumbs is a list of [label, link or ''] */
    bar(crumbs = []){
      const el = $('#bar'); if (!el) return;
      el.className = 'bar';
      el.innerHTML = `<a class="home" href="${ROOT}"><img src="${ROOT}helpers_badge_64.png" alt=""><b>The Helpers · Interactive Books</b></a>` +
        crumbs.map(c => c[1] ? `<a class="crumb" href="${esc(c[1])}">${esc(c[0])}</a>` : `<span class="crumb">${esc(c[0])}</span>`).join('') +
        `<span class="sp"></span><a class="nav" href="${ROOT}board/" aria-label="Leaderboard"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8"/></svg><span>Leaderboard</span></a><button class="who" id="who" aria-label="Account and settings"><i></i><span></span></button>`;
      $('#who').onclick = () => this.settings(); paintWho();
    },
    settings(){
      let d = $('#hubdlg'); if (!d){ d = document.createElement('div'); d.id = 'hubdlg'; d.className = 'dlg'; document.body.appendChild(d); d.addEventListener('click', e => { if (e.target === d) d.hidden = true; }); }
      const s = this.session || {}, user = s.mode === 'user';
      d.innerHTML = `<div class="card box"><h2>Account and settings</h2>
        <p>${user ? `Signed in as <b>${esc(s.name || s.email)}</b><br><small>${esc(s.email)}</small>` : '<b>You are browsing as a guest.</b> Your progress stays on this device only.'}</p>
        <label for="hubnick">Username</label>
        <div class="line"><input id="hubnick" maxlength="20" placeholder="${esc(user ? (s.name || '').split(' ')[0] : 'Pick a name')}" value="${esc(s.nick || '')}"><button class="btn" id="hubsave">Save</button></div>
        <p id="hubmsg"><small>3 to 20 characters, unique. This is the only thing the leaderboard shows about you${user ? '' : '; sign in to appear on it'}.</small></p>
        ${user ? `<label class="hubsw"><input type="checkbox" id="hubshow" ${this.hide ? '' : 'checked'}><i></i><span><b>Show me on the leaderboard</b><small>Your username and XP only. Turn off to hide.</small></span></label>` : ''}
        ${this.err ? `<p class="bad">${esc(this.err)}</p>` : ''}
        <div class="acts">${user ? `<a class="btn gh" href="${ROOT}admin/" style="text-decoration:none">Admin page</a><button class="btn gh" id="hubout">Sign out</button>` : `<button class="btn gh" id="hubleave">Leave guest mode</button><button class="btn" id="hubin">Sign in with Google</button>`}<button class="btn gh" id="hubclose">Close</button></div></div>`;
      d.hidden = false;
      const msg = $('#hubmsg');
      $('#hubsave').onclick = async () => { const v = $('#hubnick').value; if (!this.checkNick(v)){ msg.innerHTML = '<span class="bad">Use 3 to 20 letters, numbers, spaces, dots, dashes or underscores.</span>'; return; }
        msg.innerHTML = '<small>Saving…</small>'; try { await this.setNick(v); msg.innerHTML = '<span class="ok">Saved.</span>'; } catch (e){ msg.innerHTML = e.code === 'taken' ? '<span class="bad">Someone already has that username. Try another.</span>' : '<span class="bad">Could not save it to your account: ' + esc(e.code || e) + '</span>'; } };
      const sw = $('#hubshow'); if (sw) sw.onchange = async () => { try { await this.setHide(!sw.checked); msg.innerHTML = '<span class="ok">' + (sw.checked ? 'You will appear on the leaderboard after your next study session.' : 'Hidden from the leaderboard.') + '</span>'; } catch (e){ sw.checked = !sw.checked; msg.innerHTML = '<span class="bad">Could not change it: ' + esc(e.code || e) + '</span>'; } };
      $('#hubclose').onclick = () => { d.hidden = true; };
      if (user) $('#hubout').onclick = () => this.signOut(); else { $('#hubin').onclick = () => this.signIn(); $('#hubleave').onclick = () => this.leave(); }
    }
  };
  function paintWho(){ const w = $('#who'); if (!w) return; const l = Hub.label() || 'Account'; w.querySelector('i').textContent = l[0].toUpperCase(); w.querySelector('span').textContent = l; }
  Hub.inApp = inApp;
})();
