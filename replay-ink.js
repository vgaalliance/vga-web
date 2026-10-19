// The one drawing routine for the replay telestrator. The analyst page draws
// with it on their own screen and the player page draws with it on the air,
// so what the analyst sees under their pen is what goes out.
//
// A stroke: { tool, color, width, pts:[[x,y],...] }, x and y 0..1 of the 16:9
// frame, so the same stroke lands in the same place at any size.
//   pen     freehand, as drawn
//   line    straight, two points
//   arrow   straight with a head, two points               (draws itself on)
//   curve   a punch path: [start, middle, end], one clean    (draws itself on)
//           curve through all three, with a head. While it
//           is being dragged it is { raw:true } and drawn as
//           the hand moved.
//   circle  an ellipse in the box of two points
//   spot    spotlight: [centre] or [centre, edge]; the frame (fades in)
//           dims outside the ring
//
// `p` is how far the stroke has drawn itself on, 0..1. A caller that does not
// animate passes nothing and gets the finished stroke.
(function(){
  const DRAW_MS = { arrow: 380, curve: 480, spot: 260 };
  const ease = t => 1 - Math.pow(1 - t, 3);

  // How far an animated stroke has got, given when it arrived. 1 = done.
  function progress(s, born, now){
    const ms = DRAW_MS[s.tool];
    if (!ms || born == null) return 1;
    return Math.max(0, Math.min(1, (now - born) / ms));
  }

  function head(ctx, tip, ang, L){
    ctx.beginPath();
    ctx.moveTo(tip[0] - L*Math.cos(ang - 0.5), tip[1] - L*Math.sin(ang - 0.5));
    ctx.lineTo(tip[0], tip[1]);
    ctx.lineTo(tip[0] - L*Math.cos(ang + 0.5), tip[1] - L*Math.sin(ang + 0.5));
    ctx.stroke();
  }

  // The curve through start, middle and end: a quadratic whose control point
  // makes it pass through the middle at t = 0.5.
  function curvePoints(P, n){
    const [a, m, b] = P;
    const c = [2*m[0] - (a[0] + b[0])/2, 2*m[1] - (a[1] + b[1])/2];
    const out = [];
    for (let i = 0; i <= n; i++){
      const t = i/n, u = 1 - t;
      out.push([u*u*a[0] + 2*u*t*c[0] + t*t*b[0], u*u*a[1] + 2*u*t*c[1] + t*t*b[1]]);
    }
    return out;
  }

  // A finished freehand drag becomes [start, middle, end]: the middle is the
  // point of the drag farthest from the straight line between its ends, so a
  // wobbly hook comes out as the hook the analyst meant.
  function smoothCurve(pts){
    if (pts.length < 3) return pts.slice(0, 2);
    const a = pts[0], b = pts[pts.length - 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    let best = pts[Math.floor(pts.length/2)], far = -1;
    for (const p of pts){
      const d = Math.abs((p[0] - a[0])*dy - (p[1] - a[1])*dx) / len;
      if (d > far){ far = d; best = p; }
    }
    const r = v => Math.round(v*10000)/10000;
    return [a, [r(best[0]), r(best[1])], b];
  }

  function draw(ctx, s, W, H, p){
    if (!s || !s.pts || !s.pts.length) return;
    if (p == null) p = 1;
    const k = W/1920;                                  // widths scale with the frame
    const P = s.pts.map(([x,y]) => [x*W, y*H]);
    ctx.save();
    ctx.lineCap = ctx.lineJoin = "round"; ctx.strokeStyle = s.color; ctx.lineWidth = s.width*k*1.6;
    ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 4*k;
    const L = 18*k + s.width*k*2;

    if (s.tool === "spot"){
      // Centre and, if dragged, an edge; a tap gets a ring about a fighter wide.
      const [c] = P;
      const r = P[1] ? Math.hypot(P[1][0] - c[0], P[1][1] - c[1]) : W*0.11;
      const e = ease(p);
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(0,0,0,${0.62*e})`;
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(c[0], c[1], r, 0, Math.PI*2, true); ctx.fill("evenodd");
      ctx.globalAlpha = e;
      ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 6*k;
      ctx.beginPath(); ctx.arc(c[0], c[1], r*(1.15 - 0.15*e), 0, Math.PI*2); ctx.stroke();
      ctx.restore(); return;
    }

    if (s.tool === "pen" || (s.tool === "curve" && s.raw)){
      ctx.beginPath(); ctx.moveTo(...P[0]); for (const q of P.slice(1)) ctx.lineTo(...q); ctx.stroke();
      ctx.restore(); return;
    }

    if (P.length < 2){ ctx.restore(); return; }

    if (s.tool === "curve"){
      const all = P.length >= 3 ? curvePoints(P, 48) : P;
      const e = ease(p), n = Math.max(1, Math.round(e*(all.length - 1)));
      ctx.beginPath(); ctx.moveTo(...all[0]); for (let i = 1; i <= n; i++) ctx.lineTo(...all[i]); ctx.stroke();
      if (p >= 0.92){
        const tip = all[all.length - 1], prev = all[all.length - 4] || all[0];
        head(ctx, tip, Math.atan2(tip[1] - prev[1], tip[0] - prev[0]), L);
      }
      ctx.restore(); return;
    }

    const [a, b] = P;
    if (s.tool === "line" || s.tool === "arrow"){
      const e = s.tool === "arrow" ? ease(p) : 1;
      const end = [a[0] + (b[0] - a[0])*e, a[1] + (b[1] - a[1])*e];
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...end); ctx.stroke();
      if (s.tool === "arrow" && p >= 0.92) head(ctx, b, Math.atan2(b[1] - a[1], b[0] - a[0]), L);
    }
    if (s.tool === "circle"){
      const rx = Math.abs(b[0] - a[0])/2, ry = Math.abs(b[1] - a[1])/2;
      ctx.beginPath(); ctx.ellipse((a[0] + b[0])/2, (a[1] + b[1])/2, rx, ry, 0, 0, Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }

  // Spotlights go underneath everything else, so a ring never dims the arrow
  // drawn on top of it.
  function drawAll(ctx, strokes, W, H, bornOf, now){
    let moving = false;
    const order = strokes.filter(s => s && s.tool === "spot").concat(strokes.filter(s => s && s.tool !== "spot"));
    for (const s of order){
      const p = progress(s, bornOf(s), now);
      if (p < 1) moving = true;
      draw(ctx, s, W, H, p);
    }
    return moving;      // true while something is still drawing itself on
  }

  window.replayInk = draw;
  Object.assign(draw, { drawAll, smoothCurve, ANIMATED: Object.keys(DRAW_MS) });
})();
