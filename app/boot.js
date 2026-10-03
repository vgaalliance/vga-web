/* ═══ FIRST OPEN ══════════════════════════════════════════════════════
   The splash (black mark on white, the same picture the phone shows while it
   launches the app), the blinds opening from the middle, a shimmer for as long
   as the app is really loading, then either the app or the welcome.

   Three rules.
   THE OPENING ALWAYS PLAYS, and then it waits only for what is real. The
   blinds are about a second and a half; after them the shimmer holds until the
   home screen has loaded, and never longer than CAP seconds — past that the
   app's own skeleton is the honest picture. (Lifting the moment the app knew
   who was looking showed that skeleton on every open, with no opening at all.)
   THE LOOP HAS NO SEAM. It is drawn live as a function of a phase that wraps,
   so it can run for one second or sixty.
   THE WELCOME IS FOR A STRANGER ONLY: no session, never chose guest, and
   opened the app itself rather than a link to something in it.

   The app calls VGABoot.ready() when its home screen has loaded. */
(function(){
  var root = document.getElementById('boot');
  if(!root) return;
  var cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
  var still = root.querySelector('.bmark'), wel = root.querySelector('.bwel'), slow = root.querySelector('.bslow');

  function has(k){ try{ return !!localStorage.getItem(k); }catch(e){ return false; } }
  var h = location.hash || '';
  var known = has('uba.session') || has('uba.guest') || h.indexOf('access_token') !== -1 || (h.length > 1 && h !== '#home');
  var calm = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* The mark, traced from the app icon (512 space). It leans: nothing is ever
     set under it. */
  var MARK = [[96,162],[155,162],[211,290],[267,162],[333,162],[415,349],[357,349],[300,222],[244,349],[178,349]];
  var MC = [255.5,255.5], VOID = '#02010A', INK = '#000', TAU = Math.PI * 2;
  var HOLD = .4, INTRO = 1.15, EXIT = .5, CAP = 1.5, COUNT = 6.5, R = 10, B = 4000;
  var REST = .66, CY = .44, RY = .37;   /* the welcome's mark: smaller, a little higher */
  var W = 0, H = 0, S = 1;

  function size(){
    var d = Math.min(window.devicePixelRatio || 1, 2);
    W = root.clientWidth; H = root.clientHeight;
    cv.width = Math.round(W * d); cv.height = Math.round(H * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    S = Math.min(W, 460) * .78 / 352;
  }
  var clamp = function(x){ return x < 0 ? 0 : x > 1 ? 1 : x; };
  var out3 = function(x){ return 1 - Math.pow(1 - x, 3); };
  var easeIO = function(x){ return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3) / 2; };
  function bg(c){ ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); }
  function mark(cx, cy, k, fill){
    ctx.fillStyle = fill; ctx.beginPath();
    MARK.forEach(function(p, i){ var x = cx + (p[0]-MC[0])*k, y = cy + (p[1]-MC[1])*k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath(); ctx.fill();
  }
  /* a slanted line across the screen, at the strokes' own angle */
  function cutX(y, o, cx, cy){ return cx + (226-MC[0])*S + o - (y-cy)*.4385; }
  function slat(l, r, cx, cy){
    ctx.moveTo(cutX(-B,l,cx,cy), -B); ctx.lineTo(cutX(-B,r,cx,cy), -B);
    ctx.lineTo(cutX(B,r,cx,cy), B);   ctx.lineTo(cutX(B,l,cx,cy), B); ctx.closePath();
  }
  /* Blinds, black and white only. Drawn in PASSES (all the dark, then the
     mark) — slat by slat leaves a hairline across the mark wherever two
     antialiased edges meet. */
  function blinds(tt, cx, cy){
    bg('#fff'); mark(cx, cy, S, INK);
    var sp = W / COUNT, L = [];
    for(var i = -R; i <= R; i++){
      var o = out3(clamp((tt - Math.abs(i)*.065) / .5));
      if(o <= 0) continue;
      var ov = o > .97 ? 1 : 0;
      L.push([i*sp - sp*.5*o - ov, i*sp + sp*.5*o + ov + .6]);
    }
    if(!L.length) return;
    var path = function(){ ctx.beginPath(); L.forEach(function(q){ slat(q[0], q[1], cx, cy); }); };
    ctx.fillStyle = VOID; path(); ctx.fill('nonzero');
    ctx.save(); path(); ctx.clip('nonzero'); mark(cx, cy, S, '#fff'); ctx.restore();
  }
  /* The loop: a slow shimmer out from the centre. `x` fades it away. */
  function shimmer(t2, x, cx, cy){
    bg(VOID);
    var sp = W / COUNT, a = clamp(t2 / .8) * (1 - clamp(x / .6)), f = (t2 * .4) % 1;
    for(var k = -R; k <= R; k++){
      var b = .5 + .5 * Math.sin(TAU * (f - Math.abs(k)*.13));
      ctx.fillStyle = 'rgba(255,255,255,' + (a * .075 * b * b).toFixed(3) + ')';
      ctx.beginPath(); slat(k*sp - sp*.5, k*sp + sp*.5 - 1.5, cx, cy); ctx.fill();
    }
    mark(cx, cy, S, '#fff');
  }

  var t0 = 0, ready = false, exitAt = null, raf = 0, slowT = 0, state = 'run';   /* run · landed · gone */
  function now(){ return performance.now() / 1000; }

  function leave(){
    if(state === 'gone') return;
    state = 'gone';
    cancelAnimationFrame(raf); clearTimeout(slowT);
    root.classList.add('out');
    setTimeout(function(){ if(root.parentNode) root.parentNode.removeChild(root); }, 420);
  }
  function drawLanded(u){
    ctx.clearRect(0, 0, W, H); bg(VOID);
    mark(W/2, H * (CY - (CY-RY)*u), S * (1 - (1-REST)*u), '#fff');
  }
  function land(){
    if(state !== 'run') return;
    state = 'landed';
    cancelAnimationFrame(raf); clearTimeout(slowT);
    slow.hidden = true; still.style.display = 'none';
    root.classList.add('dark'); wel.classList.add('on');
    if(calm){ drawLanded(1); return; }
    var s0 = now();
    (function step(){
      var u = easeIO(clamp((now() - s0) / .6));
      drawLanded(u);
      if(u < 1 && state === 'landed') raf = requestAnimationFrame(step);
    })();
    setTimeout(function(){ if(state === 'landed') drawLanded(1); }, 750);   /* same reason as in ready() */
  }
  function finish(){ known ? leave() : land(); }

  function tick(){
    if(state !== 'run') return;
    var t = now() - t0, tt = t - HOLD, cx = W/2, cy = H * CY;
    /* a stranger waits on nothing: the welcome needs nothing from the app */
    var go = !known || ready || tt > INTRO + CAP;
    if(tt >= 0){
      still.style.display = 'none';
      if(tt < INTRO) blinds(tt, cx, cy);
      else {
        if(go && exitAt == null) exitAt = t;
        var x = exitAt == null ? 0 : clamp((t - exitAt) / EXIT);
        shimmer(tt - INTRO, x, cx, cy);
        if(x >= 1){ finish(); return; }
      }
    }
    raf = requestAnimationFrame(tick);
  }

  window.VGABoot = {
    ready: function(){
      if(ready) return;
      ready = true;
      if(state !== 'run') return;
      if(calm){ finish(); return; }
      var t = now() - t0;
      /* The frames decide when it ends, but a tab that is not on screen gets no
         frames at all — and a loader that waits on one never lifts. So the end
         is also on a plain timer, a beat after the frames would have got there. */
      setTimeout(finish, (Math.max(0, HOLD + INTRO - t) + EXIT + .15) * 1000);
    }
  };

  root.addEventListener('click', function(e){
    var b = e.target.closest('button'); if(!b) return;
    var act = b.getAttribute('data-boot');
    if(act === 'discord'){ if(typeof window.signIn === 'function') window.signIn(); }
    else if(act === 'guest'){ try{ localStorage.setItem('uba.guest', '1'); }catch(e2){} leave(); }
    else if(act === 'skip'){ leave(); }
  });
  window.addEventListener('resize', function(){ if(state === 'gone') return; size(); if(state === 'landed') drawLanded(1); });

  size();
  t0 = now();
  if(calm){
    /* no motion: the splash stands until the app is ready; a stranger gets the welcome at once */
    if(!known) land();
  } else {
    raf = requestAnimationFrame(tick);
  }
  /* the cap, on a plain timer as well: a tab off screen gets no frames */
  setTimeout(function(){ if(state === 'run') finish(); }, (HOLD + INTRO + (known ? CAP : 0) + EXIT + .15) * 1000);
  /* an app that never says ready must not trap anybody behind this screen */
  slowT = setTimeout(function(){ if(state === 'run') slow.hidden = false; }, 8000);
})();
