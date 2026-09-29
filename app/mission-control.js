/* Mission Control (2026-09-29) — the producer's one screen for every coming
   show. Read from app_staff_mission() (vga-systems db/001_schema.sql), which
   answers NULL for anybody who is not a producer. It never writes: every
   action opens the show's own dashboard card, whose buttons press Discord's
   own handlers through the bridge -- one implementation of every rule.

   The look is the CRT tachometer with seat blocks, one amber, colour = status (Castle, 09-29): one ring per opened
   department, each starting at the bottom middle and running clockwise, the
   bottom-right quarter left open for flat labels, and a health tank in the
   middle (seats filled across every opened department). */

var mc = { data: null, ev: 0, dept: null };
/* Colour is STATUS, never identity (Castle, 09-29): every ring is the same
   CRT amber, and a department's name and seat blocks are green when every
   seat is booked, amber when short, red when nobody is. Colour then says what
   needs you; position (each name at its ring's start) says which ring is which. */
var MC_AMBER = '#FFB000', MC_OK = '#39FF88', MC_EMPTY = '#FF5147';
function mcCol(d){ return !mcSeated(d) ? '#B37A00' : mcBooked(d) >= Number(d.needed) ? MC_OK : mcBooked(d) ? MC_AMBER : MC_EMPTY; }

async function mcLoad(){
  if(!session) return null;
  try{
    var r = await fetch(SB + '/rest/v1/rpc/app_staff_mission', { method:'POST',
      headers:{ apikey: KEY, Authorization:'Bearer ' + session.access_token, 'Content-Type':'application/json' }, body:'{}' });
    if(!r.ok) return { ok:false, message:"Couldn't load Mission Control (" + r.status + ")." };
    var j = await r.json();
    return j && j.events ? j : null;
  }catch(e){ return { ok:false, message:'No connection. Try again.' }; }
}

/* A department the show has opened and called: it has seats to fill. */
function mcSeated(d){ return d.status !== 'not_open' && Number(d.needed) > 0; }
function mcBooked(d){ return (d.booked || []).length; }
function mcHealth(ev){
  var need = 0, got = 0;
  (ev.depts || []).filter(mcSeated).forEach(function(d){ need += Number(d.needed); got += Math.min(mcBooked(d), Number(d.needed)); });
  return need ? Math.round(got / need * 100) : 0;
}
function mcDays(iso){
  if(!iso) return null;
  return Math.round((Date.parse(iso) - Date.now()) / 864e5);
}
function mcWhen(iso){
  if(!iso) return 'no date';
  var d = mcDays(iso);
  return d < 0 ? (d === -1 ? 'yesterday' : -d + ' days ago') : d === 0 ? 'today' : d === 1 ? 'tomorrow' : 'in ' + d + ' days';
}

/* What a department is waiting on, and where the fix lives. `go` is the
   staff room sub the button opens: the show's own card, or the producer desk
   when the department is not opened yet (Activate lives there). */
function mcState(ev, d){
  var soon = ev.at && mcDays(ev.at) <= 3;
  if(d.status === 'not_open'){
    if(!d.lead) return { word: 'NO LEAD', level: soon ? 2 : 1, line: 'Appoint a lead, then open it.', go: 'desk:producer', btn: 'OPEN DESK' };
    return { word: 'NOT OPEN', level: soon ? 2 : 0, line: 'Not activated for this show.', go: 'desk:producer', btn: 'ACTIVATE' };
  }
  var show = d.pd_id ? 'desk:show:' + d.pd_id : 'desk:producer';
  if(d.status === 'closed' || d.status === 'delivered') return { word: 'CLOSED', level: 0, line: 'Closed by the lead.', go: show, btn: 'OPEN' };
  if(!Number(d.needed)) return { word: 'NO CALL', level: soon ? 2 : 1, line: 'The lead has not posted the call.', go: show, btn: 'OPEN' };
  var left = Number(d.needed) - mcBooked(d), asks = (d.requests || []).length;
  if(left <= 0) return { word: 'SET', level: 0, line: 'Every seat booked.', go: show, btn: 'OPEN' };
  if(asks) return { word: 'BOOK', level: 1, line: asks + ' requested · ' + left + ' seat' + (left === 1 ? '' : 's') + ' left', go: show, btn: 'BOOK' };
  if(!d.crew) return { word: 'NO CREW', level: 2, line: 'Nobody in this department but the lead.', go: show, btn: 'OPEN' };
  return { word: 'SHORT', level: soon ? 2 : 1, line: 'Nobody has requested yet.', go: show, btn: 'OPEN' };
}

function mcRing(ev){
  var seated = (ev.depts || []).filter(mcSeated).slice(0, 5), n = seated.length;
  var c = 150, w = 12, gap = n > 4 ? 16 : 19, R0 = 116, a0 = 90, span = 270;
  var pt = function(r, a){ var t = a * Math.PI / 180; return [c + r * Math.cos(t), c + r * Math.sin(t)]; };
  var body = '', labels = '';
  /* the rev-counter scale */
  for(var k = 0; k <= 20; k++){
    var a = a0 + span * k / 20, p1 = pt(R0 + 10, a), p2 = pt(R0 + (k % 5 ? 15 : 20), a);
    body += '<line x1="' + p1[0].toFixed(1) + '" y1="' + p1[1].toFixed(1) + '" x2="' + p2[0].toFixed(1) + '" y2="' + p2[1].toFixed(1) + '" stroke="#FFB000" stroke-opacity="' + (k % 5 ? .45 : .9) + '" stroke-width="' + (k % 5 ? 1 : 2) + '"/>';
    if(k % 5 === 0 && k < 20){ var p3 = pt(R0 + 28, a); body += '<text x="' + p3[0].toFixed(1) + '" y="' + (p3[1] + 4).toFixed(1) + '" text-anchor="middle" fill="#B37A00" style="font:400 13px VT323,monospace">' + (k * 5) + '</text>'; }
  }
  seated.forEach(function(d, i){
    var r = R0 - i * gap, col = MC_AMBER, st = mcCol(d), circ = 2 * Math.PI * r, arc = circ * span / 360;
    var f = Math.max(Math.min(1, mcBooked(d) / Number(d.needed)), .012);
    var idx = ev.depts.indexOf(d), dim = mc.dept != null && mc.dept !== idx ? .25 : 1;
    var rot = ' transform="rotate(' + a0 + ' ' + c + ' ' + c + ')"';
    /* The lit LED segments, cut to the seats booked by a mask. The mask sits
       in the ring's own rotated space, so it takes NO rotate of its own -- a
       second one put the fill 90° ahead, through the open corner (09-28). */
    var mid = 'mcm' + i;
    body += '<g data-mcdept="' + idx + '" style="cursor:pointer" opacity="' + dim + '">'
      + '<mask id="' + mid + '" maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="300"><circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="#fff" stroke-width="' + (w + 2) + '" stroke-dasharray="' + (arc * f).toFixed(1) + ' ' + circ.toFixed(1) + '"/></mask>'
      + '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-opacity=".13" stroke-width="' + w + '" stroke-dasharray="' + arc.toFixed(1) + ' ' + circ.toFixed(1) + '"' + rot + '/>'
      + '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-dasharray="13 4" mask="url(#' + mid + ')"' + rot + '/>'
      + '</g>';
    /* Seat blocks (Castle's pick, 09-29): the name, then one block per seat --
       lit when booked, hollow when empty. Capped at 8 blocks; past that the
       count says it. */
    var on = mc.dept === idx, y = c + r + 4.5, x = c + 9, name = String(d.name).toUpperCase();
    var bx = x + name.length * 6.9 + 8, seats = Number(d.needed), shown = Math.min(seats, 8), bl = '';
    for(var k = 0; k < shown; k++){ var lit = k < mcBooked(d); bl += '<rect x="' + (bx + k * 11).toFixed(1) + '" y="' + (y - 9) + '" width="8" height="8" fill="' + (lit ? st : 'none') + '" stroke="' + st + '" stroke-width="1"/>'; }
    if(seats > shown) bl += '<text x="' + (bx + shown * 11 + 2).toFixed(1) + '" y="' + y + '" fill="#FFB000" style="font:400 13px VT323,monospace">' + mcBooked(d) + '/' + seats + '</text>';
    labels += '<g data-mcdept="' + idx + '" style="cursor:pointer"' + (mc.dept != null && !on ? ' opacity=".4"' : '') + '>'
      + (on ? '<rect x="' + (x - 3) + '" y="' + (y - 11) + '" width="' + (R0 - 4) + '" height="14" fill="#FFB000" opacity=".18"/>' : '')
      + '<text x="' + x + '" y="' + y + '" fill="' + st + '" style="font:400 14px VT323,monospace;letter-spacing:.8px">' + esc(name) + '</text>' + bl + '</g>';
  });
  var inner = n ? Math.min(R0 - (n - 1) * gap - w / 2 - 8, 60) : 60;
  return '<div class="mcring"><svg viewBox="0 0 300 300"><defs><filter id="mcglow" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
    + '<g class="mcflick" filter="url(#mcglow)">' + body + '</g>' + mcTank(ev, inner) + labels
    + (n ? '' : '<text x="150" y="290" text-anchor="middle" fill="#B37A00" style="font:400 15px VT323,monospace">NO DEPARTMENT CALLED YET</text>')
    + '</svg></div>';
}
function mcTank(ev, r){
  var p = mcHealth(ev), col = p >= 90 ? '#39FF88' : p >= 50 ? '#FFB000' : '#FF5147';
  var lvl = 150 + r - 2 * r * Math.max(.04, Math.min(.96, p / 100));
  var wave = 'M0 0 Q 12.5 -5 25 0 T 50 0 T 75 0 T 100 0 T 125 0 T 150 0 T 175 0 T 200 0 V 140 H 0 Z', s = r * 2 / 100;
  return '<defs><clipPath id="mctank"><circle cx="150" cy="150" r="' + (r - 2) + '"/></clipPath></defs>'
    + '<circle cx="150" cy="150" r="' + r + '" fill="none" stroke="#FFB000" stroke-opacity=".35" stroke-dasharray="2 3"/>'
    + '<g clip-path="url(#mctank)"><g transform="translate(' + (150 - r) + ' ' + lvl.toFixed(1) + ') scale(' + s.toFixed(3) + ')">'
    + '<g class="mcwv2"><path d="' + wave + '" fill="' + col + '" fill-opacity=".25" stroke="' + col + '" stroke-width="1"/></g>'
    + '<g class="mcwv1"><path d="' + wave + '" fill="' + col + '" fill-opacity=".45" transform="translate(-12 3)"/></g></g></g>'
    + '<text x="150" y="' + (150 + r * .12).toFixed(1) + '" text-anchor="middle" fill="#FFE9B0" style="font:400 ' + Math.min(44, r * .9).toFixed(0) + 'px VT323,monospace">' + p + '%</text>'
    + '<text x="150" y="' + (150 + r * .5).toFixed(1) + '" text-anchor="middle" fill="#FFB000" style="font:400 ' + Math.min(13, r * .3).toFixed(0) + 'px VT323,monospace;letter-spacing:2px">HEALTH</text>';
}

function mcDetail(ev){
  if(mc.dept == null) return '<div class="mchint">&gt; tap a department</div>';
  var d = ev.depts[mc.dept]; if(!d) return '';
  var st = mcState(ev, d);
  var h = '<div class="mcdet"><div class="mcp"><span style="color:' + mcCol(d) + '">■</span><span>' + esc(String(d.name).toUpperCase()) + '</span><em>' + (mcSeated(d) ? mcBooked(d) + '/' + d.needed : st.word) + '</em></div>'
    + '<div class="mcp"><span>LEAD</span><em>' + esc(d.lead || 'none') + '</em></div>';
  (d.booked || []).forEach(function(n){ h += '<div class="mcp"><span>' + esc(n) + '</span><em>booked</em></div>'; });
  if(mcSeated(d) && mcBooked(d) < Number(d.needed)) (d.requests || []).forEach(function(r){ h += '<div class="mcp"><span>' + esc(r.name) + '</span><em>requested · ' + esc(RUNG_WORD[r.rung] || r.rung || 'crew') + '</em></div>'; });
  if(d.standby) h += '<div class="mcp"><span>STANDBY</span><em>' + d.standby + '</em></div>';
  h += '<div class="mcp mcline"><span>' + esc(st.line) + '</span><button data-stsub="' + esc(st.go) + '">' + esc(st.btn) + '</button></div>';
  return h + '</div>';
}

function mcNeeds(ev){
  var rows = (ev.depts || []).map(function(d){ return { d: d, s: mcState(ev, d) }; }).filter(function(x){ return x.s.level > 0 || x.s.word === 'BOOK'; });
  rows.sort(function(a, b){ return b.s.level - a.s.level; });
  return '<div class="mcnd"><div class="mch">&gt; NEEDS YOU</div>' + (rows.length ? rows.map(function(x){
    return '<div class="mcr"><b style="opacity:' + (x.s.level === 2 ? 1 : .55) + '"></b><span>' + esc(String(x.d.name).toUpperCase()) + ': ' + esc(x.s.word) + '</span><button data-stsub="' + esc(x.s.go) + '">' + esc(x.s.btn) + '</button></div>';
  }).join('') : '<div class="mcr"><span>ALL COVERED</span></div>') + '</div>';
}

function mcHTML(){
  var m = mc.data;
  if(m && m.ok === false){ retryHandlers['staff'] = function(){ renderStaff(stf.sub); }; return failHTML(m.message, 'staff'); }
  if(!m) return '<div class="empty">Mission Control is for producers.</div>';
  var evs = m.events || [];
  if(!evs.length) return '<div class="mcscr"><div class="mchint">&gt; NO SHOWS COMING. START ONE ON THE PRODUCER DESK.</div><div class="mcnd"><div class="mcr"><span>PRODUCER DESK</span><button data-stsub="desk:producer">OPEN</button></div></div></div>';
  if(mc.ev >= evs.length) mc.ev = 0;
  var ev = evs[mc.ev];
  return '<div class="mcscr"><div class="mcevs">' + evs.map(function(x, i){
      return '<button data-mcev="' + i + '" class="' + (i === mc.ev ? 'on' : '') + '">' + esc(x.name) + ' ' + mcHealth(x) + '%</button>';
    }).join('') + '</div>'
    + '<div class="mcsub">' + esc(ev.name) + ' · ' + esc(mcWhen(ev.at)) + ' · ' + esc(String(ev.status).toUpperCase()) + '</div>'
    + mcRing(ev)
    + '<div class="mcdg">' + ev.depts.map(function(d, i){
        var st = mcState(ev, d), on = mcSeated(d), c = mcCol(d);
        return '<button data-mcdept="' + i + '" class="' + (mc.dept === i ? 'on' : '') + (on ? '' : ' off') + '"><i style="background:' + (on ? c : 'transparent') + ';color:' + (on ? c : '#5A3C00') + '"></i><span>' + esc(String(d.name).toUpperCase()) + '</span><em>' + (on ? mcBooked(d) + '/' + d.needed : esc(st.word)) + '</em></button>';
      }).join('') + '</div>'
    + mcDetail(ev) + mcNeeds(ev) + '</div>';
}

/* The home tile: the next show's health, one tap in. */
function mcTile(){
  var m = mc.data;
  if(!m || m.ok === false) return '';
  var ev = (m.events || [])[0];
  var line = ev ? esc(ev.name) + ' · ' + mcHealth(ev) + '% · ' + esc(mcWhen(ev.at)) : 'No shows coming';
  return '<a href="#" class="mrow mctile" data-stsub="mission"><span class="mic">📟</span>'
    + '<div style="flex:1;min-width:0"><div class="t">Mission Control</div><div class="s">' + line + '</div></div><span class="rr"><span class="c">&rsaquo;</span></span></a>';
}

document.addEventListener('click', function(e){
  if(!document.querySelector('.mcscr')) return;
  var t;
  if((t = e.target.closest('[data-mcev]'))){ e.preventDefault(); mc.ev = +t.getAttribute('data-mcev'); mc.dept = null; stfPaint(); return; }
  if((t = e.target.closest('[data-mcdept]'))){ e.preventDefault(); var i = +t.getAttribute('data-mcdept'); mc.dept = mc.dept === i ? null : i; stfPaint(); }
});
