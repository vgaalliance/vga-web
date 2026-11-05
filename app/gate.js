/* ═══ THE LOCK ════════════════════════════════════════════════════════
   The app is not released. It sits on a public address, Google found its
   fighter pages, and a member walked in from a search (2026-11-05). This puts
   a "Coming soon" screen over EVERYTHING until the person is signed in with a
   Discord account on the early list (`app_access`, read through
   `app_has_access()`).

   Three rules.
   THE SCREEN IS UP FIRST. It is drawn by this file before the app paints
   anything, and only taken down by a yes from the database (or a yes from the
   last 12 hours, re-checked behind it). A no, a dead session or a failed
   check leaves it up.
   IT IS A CURTAIN, NOT A SAFE. The data behind the app is public anyway (the
   website shows it); what this hides is the app itself.
   TO OPEN THE APP TO EVERYONE, delete the <script src="./gate.js"> line in
   index.html and bump the service worker. Add a person: insert their Discord
   id into `app_access`. */
(function(){
  var SB = 'https://emzlivoykbhhjcugupit.supabase.co';
  var KEY = 'sb_publishable_pqhH974E1q9YsFnrVH1UJQ_X3V-rRLF';
  var OK_KEY = 'uba.gate.ok', OK_FOR = 12 * 3600 * 1000;

  function get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function set(k, v){ try{ v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }catch(e){} }

  var css = document.createElement('style');
  css.textContent =
    '#gate{position:fixed;inset:0;z-index:2147483647;background:#02010A;color:#F3F1F8;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:18px;padding:24px;text-align:center;font-family:Barlow,system-ui,sans-serif}' +
    '#gate[hidden]{display:none}' +
    '#gate svg{width:120px;height:auto}' +
    '#gate h1{margin:6px 0 0;font:400 44px/1 "Bebas Neue",Barlow,system-ui,sans-serif;letter-spacing:.04em}' +
    '#gate p{margin:0;max-width:300px;font-size:15px;line-height:1.45;color:#B9B3CC}' +
    '#gate button{margin-top:10px;height:44px;padding:0 22px;border-radius:22px;border:1.5px solid #5A5375;background:transparent;' +
    'color:#B9B3CC;font:600 14px Barlow,system-ui,sans-serif;cursor:pointer}' +
    'html.gated,html.gated body{overflow:hidden!important}';
  document.head.appendChild(css);

  var g = document.createElement('div');
  g.id = 'gate';
  g.innerHTML =
    '<svg viewBox="96 162 319 187" aria-hidden="true"><polygon fill="#fff" points="96,162 155,162 211,290 267,162 333,162 415,349 357,349 300,222 244,349 178,349"/></svg>' +
    '<h1>Coming soon</h1><p class="gmsg">The VGA app isn’t open yet. Follow the UBA Discord for the launch.</p>' +
    '<button type="button" class="gbtn" hidden></button>';
  var msg = g.querySelector('.gmsg'), btn = g.querySelector('.gbtn');
  document.documentElement.classList.add('gated');
  (document.body || document.documentElement).appendChild(g);

  function open(){ g.hidden = true; document.documentElement.classList.remove('gated'); }
  function shut(text, label, act){
    g.hidden = false; document.documentElement.classList.add('gated');
    if(text) msg.textContent = text;
    if(label){ btn.textContent = label; btn.hidden = false; btn.onclick = act; } else btn.hidden = true;
  }
  function signIn(){
    location.href = SB + '/auth/v1/authorize?provider=discord&redirect_to=' + encodeURIComponent(location.origin + location.pathname);
  }
  function signOut(){ set('uba.session', null); set(OK_KEY, null); location.reload(); }
  var teamSignIn = function(){ shut(null, 'Team sign in', signIn); };

  /* The session: fresh from a Discord return (the app reads the same hash
     after this and clears it), else the one the app saved. */
  var s = null, h = location.hash || '';
  if(h.indexOf('access_token=') !== -1){
    var p = new URLSearchParams(h.slice(1));
    s = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token') };
  } else {
    try{ s = JSON.parse(get('uba.session') || 'null'); }catch(e){ s = null; }
  }
  if(!s || !s.access_token){ set(OK_KEY, null); teamSignIn(); return; }

  /* A yes from the last 12 hours opens at once; the check below still runs. */
  var okAt = +(get(OK_KEY) || 0), recent = okAt && Date.now() - okAt < OK_FOR;
  if(recent) open();

  function ask(token){
    return fetch(SB + '/rest/v1/rpc/app_has_access', {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: '{}'
    });
  }
  /* An expired token is the normal state on a cold open: renew it once and
     save it the way the app does, so the app picks up the same session. */
  function renew(){
    if(!s.refresh_token) return Promise.resolve(null);
    return fetch(SB + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    }).then(function(r){ return r.ok ? r.json() : null; }).then(function(d){
      if(!d || !d.access_token) return null;
      var n = { access_token: d.access_token, refresh_token: d.refresh_token || s.refresh_token,
                expires_at: Date.now() + (d.expires_in || 3600) * 1000 };
      if(h.indexOf('access_token=') === -1) set('uba.session', JSON.stringify(n));
      return n.access_token;
    }).catch(function(){ return null; });
  }

  ask(s.access_token).then(function(r){
    if(r.status !== 401) return r;
    return renew().then(function(t){ return t ? ask(t) : null; });
  }).then(function(r){
    if(!r){ set(OK_KEY, null); teamSignIn(); return null; }          /* session dead: sign in again */
    if(!r.ok) throw new Error('check ' + r.status);
    return r.json().then(function(yes){
      if(yes === true){ set(OK_KEY, String(Date.now())); open(); }
      else { set(OK_KEY, null); shut('The VGA app isn’t open yet. This Discord account isn’t on the early list.', 'Sign out', signOut); }
    });
  }).catch(function(){
    /* Could not ask. A recent yes stays open; anybody else waits. */
    if(!recent) shut('Couldn’t check your access. Check your connection.', 'Try again', function(){ location.reload(); });
  });
})();
