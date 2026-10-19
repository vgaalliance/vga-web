// The one drawing routine for the replay telestrator. The analyst page draws
// with it on their own screen and the player page draws with it on the air,
// so what the analyst sees under their pen is what goes out.
//
// A stroke: { tool:"pen"|"line"|"arrow"|"circle", color, width, pts:[[x,y],...] }
// x and y are 0..1 of the 16:9 frame, so the same stroke lands in the same
// place at any size.
window.replayInk = function draw(ctx, s, W, H){
  if (!s || !s.pts || !s.pts.length) return;
  const k = W/1920;                                  // widths scale with the frame
  ctx.lineCap = ctx.lineJoin = "round"; ctx.strokeStyle = s.color; ctx.lineWidth = s.width*k*1.6;
  ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 4*k;
  const P = s.pts.map(([x,y]) => [x*W, y*H]);
  ctx.beginPath();
  if (s.tool === "pen"){ ctx.moveTo(...P[0]); for (const p of P.slice(1)) ctx.lineTo(...p); ctx.stroke(); return; }
  if (P.length < 2) return;
  const [a,b] = P;
  if (s.tool === "line" || s.tool === "arrow"){
    ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
    if (s.tool === "arrow"){
      const ang = Math.atan2(b[1]-a[1], b[0]-a[0]), L = 18*k + s.width*k*2;
      ctx.beginPath(); ctx.moveTo(...b);
      ctx.lineTo(b[0]-L*Math.cos(ang-0.5), b[1]-L*Math.sin(ang-0.5));
      ctx.moveTo(...b);
      ctx.lineTo(b[0]-L*Math.cos(ang+0.5), b[1]-L*Math.sin(ang+0.5));
      ctx.stroke();
    }
  }
  if (s.tool === "circle"){
    const rx = Math.abs(b[0]-a[0])/2, ry = Math.abs(b[1]-a[1])/2;
    ctx.ellipse((a[0]+b[0])/2, (a[1]+b[1])/2, rx, ry, 0, 0, Math.PI*2); ctx.stroke();
  }
};
