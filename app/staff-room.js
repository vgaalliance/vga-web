/* ═══ STAFF ROOM (2026-09-26) ═══════════════════════════════════════════
   One room on the You tab, for anybody with a staff row. Two halves, and the
   rule behind both is that the app and Discord can never disagree:

   CREW is drawn here from app_staff_home() — the signed-in person's calls,
   jobs, pay and standing — but every button presses DISCORD'S OWN button
   (prod_in, job_take, job_handin, reward_claim …) through app_staff_press().
   The bot runs the press through the exact handler a Discord press runs
   (vga-systems bot/src/lib/app-bridge.js), so there is one set of rules.

   LEAD and PRODUCER dashboards are not redrawn at all: the bot saves every
   dashboard card it draws to staff_views, and this file renders that Discord
   message — same text, same buttons — in the app's look. A dashboard change
   in the bot appears here with no app change.

   A press answers with what Discord would have shown privately: a screen (a
   picker, a review, a confirm), a form (a Discord modal), or a line of text.
   Forms and screens open as a panel over the room. */

var stf = { home: null, views: null, sub: 'home', panel: null, rt: null, busy: false };

function stfBack(){ return '<div class="evhead">' + backButton() + '<div style="height:34px"></div>'; }

async function renderStaff(sub){
  stf.sub = sub || 'home';
  var body = document.getElementById('sheet-body');
  var title = { home: 'Staff', open: 'Up for grabs', jobs: 'My jobs', pay: 'Pay', ladder: 'Ladder', desks: 'Dashboards' }[stf.sub.split(':')[0]]
    || (stf.sub.indexOf('playbook:') === 0 ? 'Playbook' : 'Dashboard');
  body.innerHTML = stfBack() + '<div class="kick">You · Staff</div><h3>' + esc(title) + '</h3></div>'
    + '<div id="stb"><div class="skel" style="height:90px"></div><div class="skel" style="width:60%"></div></div>'
    + '<div id="stpanel" class="stpanel" aria-hidden="true"></div>';
  await stfLoad();
  stfPaint();
  stfRealtime();
}

async function stfLoad(){
  var got = await Promise.all([ rpc('app_staff_home'), qMe('staff_views?select=key,audience,dept_id,sort,payload,updated_at&order=sort.asc') ]);
  stf.home = got[0] && got[0].me ? got[0] : (got[0] && got[0].ok === false ? got[0] : null);
  stf.views = got[1] || [];
}

/* ── the crew half ─────────────────────────────────────────────────────── */
function stfLab(t, link, linkSub){
  return '<div class="lab"><b>' + esc(t) + '</b><i></i>'
    + (link ? '<a href="#" data-stsub="' + esc(linkSub) + '">' + esc(link) + '</a>' : '') + '</div>';
}
function stfBtn(cid, label, cls, extra){
  return '<button class="stb ' + (cls || '') + '" data-stpress="' + esc(cid) + '"' + (extra || '') + '>' + esc(label) + '</button>';
}
function stfWhen(iso){
  if(!iso) return '';
  try{ return new Date(iso).toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZone:'America/New_York' }) + ' ET'; }
  catch(e){ return ''; }
}
function vcs(n){ return Number(n || 0).toLocaleString() + ' VC'; }
var RUNG_WORD = { onboarded:'Onboarded', tryout:'Tryout · half pay', full_time:'Full time', instructor:'Instructor', lead:'Lead', signup:'Signed up' };

function stfCallCard(c, depts){
  var d = (depts || []).filter(function(x){ return x.id === c.dept_id; })[0] || {};
  var backup = d.rung === 'onboarded';
  var line = esc(c.dept) + ' · ' + esc(stfWhen(c.at)) + ' · ' + vcs(c.rate) + ' · '
    + c.needed + (c.needed === 1 ? ' seat' : ' seats') + (c.hands ? ' · ' + c.hands + ' hands up' : '');
  var act;
  if(c.mine === 'in') act = '<span class="stok">You\'re in · your lead picks</span>' + stfBtn('prod_out:' + c.pd_id, 'Take it back', 'ghost');
  else if(c.mine === 'booked' || c.mine === 'confirmed') act = '<span class="stok">Booked</span>';
  else if(c.mine === 'standby') act = '<span class="stok">On standby</span>' + stfBtn('prod_out:' + c.pd_id, 'Take it back', 'ghost');
  else if(c.mine === 'invited') act = stfBtn('inv_yes:' + c.mine_id, "I'm in", 'gold') + stfBtn('inv_no:' + c.mine_id, "Can't", 'ghost');
  else if(c.status === 'calling') act = backup ? stfBtn('prod_backup:' + c.pd_id, 'Backup', 'violet') : stfBtn('prod_in:' + c.pd_id, "I'm in", 'gold');
  else act = '<span class="stq">Crewed</span>';
  return '<div class="stc"><div class="t">' + esc(c.show) + '</div><div class="s">' + line + '</div>'
    + (backup && c.status === 'calling' && !c.mine ? '<div class="s">You\'re onboarded: Backup puts you on the list. Your first booking makes you a tryout.</div>' : '')
    + '<div class="sta">' + act + '</div></div>';
}
function stfJobCard(j){
  var meta = esc(j.dept) + (j.show ? ' · ' + esc(j.show) : '') + (j.due ? ' · due ' + esc(stfWhen(j.due)) : '') + ' · ' + vcs(j.rate)
    + (j.asks ? ' · ' + j.asks + ' asked' : '');
  var act = j.mine === 'in' ? '<span class="stok">Asked · your lead decides</span>' : stfBtn('job_take:' + j.id, 'I want it', 'violet');
  return '<div class="stc"><div class="t">' + esc(j.title) + '</div><div class="s">' + meta + '</div>'
    + (j.brief ? '<div class="stbrief">' + esc(j.brief) + '</div>' : '') + '<div class="sta">' + act + '</div></div>';
}
function stfMyJob(j){
  var r = j.review;
  var state = r && r.status === 'submitted' ? 'Handed in · round ' + r.round + ' · waiting for review'
    : r && r.status === 'revise' ? 'Sent back' + (r.note ? ': ' + r.note : '') : (j.due ? 'Due ' + stfWhen(j.due) : 'In progress');
  var act = r && r.status === 'submitted' ? '' : stfBtn('job_handin:' + j.crew_id, r && r.status === 'revise' ? 'Hand in again' : 'Hand in', 'gold')
    + '<button class="stb ghost" data-stdrop="' + esc(j.crew_id) + '" data-sttitle="' + esc(j.title) + '">Drop it…</button>';
  return '<div class="stc"><div class="t">' + esc(j.title) + '</div><div class="s">' + esc(j.dept) + ' · ' + esc(state) + (j.amount ? ' · ' + vcs(j.amount) : '') + '</div>'
    + (j.brief ? '<div class="stbrief">' + esc(j.brief) + '</div>' : '') + (act ? '<div class="sta">' + act + '</div>' : '') + '</div>';
}
function stfPayBlock(pay){
  var pend = pay.pending || [];
  var sum = pend.reduce(function(a, r){ return a + Number(r.vc || 0); }, 0);
  var html = '<div class="stc stpay"><div><div class="big">' + Number(sum).toLocaleString() + '</div><div class="s">VC to claim</div></div>'
    + '<div><div class="big dim">' + Number(pay.month || 0).toLocaleString() + '</div><div class="s">this month</div></div></div>';
  pend.forEach(function(r){
    html += '<div class="stc strow"><div><div class="t">' + esc(r.reason || 'Pay') + '</div><div class="s">' + vcs(r.vc) + '</div></div>'
      + stfBtn('reward_claim:' + r.id, 'Claim', 'gold') + '</div>';
  });
  return html;
}

function stfHomeHTML(h){
  var html = '';
  var me = h.me || {};
  var depts = h.depts || [];
  var leads = depts.filter(function(d){ return d.role === 'lead'; });
  var views = stf.views || [];
  /* Waiting on you: what needs this person, first. */
  var wait = '';
  (h.my_shows || []).filter(function(s){ return s.status === 'invited'; }).forEach(function(s){
    wait += '<div class="stc"><div class="t">' + esc(s.show) + ' · ' + esc(s.dept) + '</div><div class="s">Your lead invited you · ' + esc(stfWhen(s.at)) + '</div>'
      + '<div class="sta">' + stfBtn('inv_yes:' + s.crew_id, "I'm in", 'gold') + stfBtn('inv_no:' + s.crew_id, "Can't", 'ghost') + '</div></div>';
  });
  (h.my_jobs || []).filter(function(j){ return !(j.review && j.review.status === 'submitted'); }).forEach(function(j){ wait += stfMyJob(j); });
  if((h.pay.pending || []).length) wait += stfPayBlock(h.pay);
  html += stfLab('Waiting on you') + (wait || '<div class="stc stq">Nothing. You\'re clear.</div>');

  if(views.length){
    html += stfLab('Your dashboards', 'Open', 'desks');
    html += views.filter(function(v){ return v.key === 'producer' || v.key.indexOf('desk:') === 0; }).map(function(v){
      return '<a href="#" class="mrow" data-stsub="desk:' + esc(v.key) + '"><span class="mic">' + (v.key === 'producer' ? '🎬' : '📋') + '</span>'
        + '<div style="flex:1;min-width:0"><div class="t">' + esc(stfViewTitle(v)) + '</div><div class="s">The same card as Discord · live</div></div>'
        + '<span class="rr"><span class="c">&rsaquo;</span></span></a>';
    }).join('');
  }

  var calls = h.calls || [], open = h.open_jobs || [];
  html += stfLab('Up for grabs', (calls.length + open.length) > 2 ? 'See all ' + (calls.length + open.length) : '', 'open');
  var first = calls.slice(0, 1).map(function(c){ return stfCallCard(c, depts); }).concat(open.slice(0, calls.length ? 1 : 2).map(stfJobCard));
  html += first.join('') || '<div class="stc stq">No open calls or jobs right now.</div>';

  var booked = (h.my_shows || []).filter(function(s){ return s.status !== 'invited'; });
  html += stfLab('My jobs', 'See all', 'jobs');
  html += '<a href="#" class="stc stlink" data-stsub="jobs"><div><div class="t">' + (h.my_jobs || []).length + ' job' + ((h.my_jobs || []).length === 1 ? '' : 's') + ' · ' + booked.length + ' show' + (booked.length === 1 ? '' : 's') + '</div>'
    + '<div class="s">' + (booked[0] ? esc(booked[0].show) + ' · ' + esc(stfWhen(booked[0].at)) : 'Nothing booked') + '</div></div><span class="c">&rsaquo;</span></a>';

  html += stfLab('Pay', 'History', 'pay');
  if(!(h.pay.pending || []).length) html += '<div class="stc stpay"><div><div class="big dim">0</div><div class="s">to claim</div></div><div><div class="big dim">' + Number(h.pay.month || 0).toLocaleString() + '</div><div class="s">this month</div></div></div>';

  html += stfLab('Standing', 'Ladder', 'ladder');
  html += depts.map(function(d){
    var vet = (d.rung === 'full_time' || d.rung === 'instructor' || d.rung === 'lead') && d.delivered >= 10;
    return '<a href="#" class="stc stlink" data-stsub="ladder"><div><div class="t">' + esc(d.name) + '</div><div class="s">' + esc(RUNG_WORD[d.rung] || d.rung) + (vet ? ' · Veteran' : '') + ' · ' + d.delivered + ' delivered</div></div><span class="c">&rsaquo;</span></a>';
  }).join('');

  html += stfLab('Playbooks');
  html += depts.map(function(d){
    return '<a href="#" class="stc stlink" data-stsub="playbook:' + esc(d.id) + '"><div class="t">How ' + esc(d.name) + ' works</div><span class="c">&rsaquo;</span></a>';
  }).join('');
  return html;
}

function stfViewTitle(v){
  if(v.key === 'producer') return 'Producer desk';
  var t = stfFirstText(v.payload);
  var m = t.match(/^##\s*(.+)$/m);
  return (m ? m[1] : t.split('\n')[0]).replace(/[*_`]/g, '').replace(/​/g, '').slice(0, 60) || 'Dashboard';
}
function stfFirstText(p){
  var out = '';
  (function walk(list){ (list || []).some(function(c){ if(c.type === 10 && !out){ out = String(c.content || ''); return true; } walk(c.components); return !!out; }); })(p && p.components);
  return out;
}

function stfLadderHTML(h){
  return (h.depts || []).map(function(d){
    var steps = ['onboarded','tryout','full_time'];
    var at = Math.max(0, steps.indexOf(d.rung));
    if(d.rung === 'instructor' || d.rung === 'lead') at = 2;
    var vet = at === 2 && d.delivered >= 10;
    var bar = steps.map(function(s, i){ return '<i class="' + (i < at ? 'on' : i === at ? 'now' : '') + '"></i>'; }).join('');
    var next = d.rung === 'onboarded' ? 'Your first booking makes you a tryout.'
      : d.rung === 'tryout' ? 'Three delivered with no no-shows makes you full time.'
      : vet ? 'Veteran: every job and show here pays you 1.2×.' : (10 - d.delivered) + ' more delivered for Veteran — 1.2× pay.';
    return stfLab(d.name) + '<div class="stc"><div class="stbar">' + bar + '</div>'
      + '<div class="t">' + esc(RUNG_WORD[d.rung] || d.rung) + (vet ? ' <span class="stvet">Veteran</span>' : '') + '</div>'
      + '<div class="s">' + d.delivered + ' delivered · ' + d.dropped + ' dropped · ' + d.no_shows + ' no-show' + (d.no_shows === 1 ? '' : 's') + '</div>'
      + '<div class="s">' + esc(next) + '</div></div>';
  }).join('') + '<div class="stc stq">Two no-shows in a department takes you off it. A drop isn\'t a no-show, but your lead sees it. A cancelled job never counts.</div>';
}
function stfPlaybookHTML(h, id){
  var d = (h.depts || []).filter(function(x){ return x.id === id; })[0];
  if(!d) return '<div class="empty">That department is gone.</div>';
  var pb = d.playbook || {};
  var links = Array.isArray(pb.links) ? pb.links : [];
  if(!pb.text && !links.length) return '<div class="stc"><div class="t">How ' + esc(d.name) + ' works</div><div class="s">Your lead is writing this — the rules, how shows run here, and the links you\'ll need. Coming soon.</div></div>';
  return '<div class="stc"><div class="t">How ' + esc(d.name) + ' works</div>' + (pb.text ? '<div class="stmd">' + stfMd(pb.text) + '</div>' : '')
    + (links.length ? '<div class="lab" style="margin:14px 0 8px"><b>Links</b><i></i></div>' + links.map(function(l){ return '<a class="stlk" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label || l.url) + '</a>'; }).join('') : '')
    + (pb.by ? '<div class="s" style="margin-top:10px">Written by ' + esc(pb.by) + '</div>' : '') + '</div>';
}

function stfPaint(){
  var el = document.getElementById('stb');
  if(!el) return;
  if(!me){ el.innerHTML = '<div class="empty">Sign in with Discord to see your staff work.</div>'; return; }
  var h = stf.home;
  if(h && h.ok === false){ retryHandlers['staff'] = function(){ renderStaff(stf.sub); }; el.innerHTML = failHTML(h.message || "Couldn't load your staff work.", 'staff'); return; }
  if(!h){ el.innerHTML = '<div class="empty"><b>You\'re not on staff.</b><br>Join through <b>Join the VGA crew</b> in the UBA server.</div>'; return; }
  var sub = stf.sub, html = '';
  if(sub === 'home') html = stfHomeHTML(h);
  else if(sub === 'open'){
    html = stfLab('Show calls') + ((h.calls || []).map(function(c){ return stfCallCard(c, h.depts); }).join('') || '<div class="stc stq">No open calls.</div>')
      + stfLab('Jobs') + '<div class="s" style="margin:0 18px 8px">Your lead picks who gets each one. Asking puts your name in front of them.</div>'
      + ((h.open_jobs || []).map(stfJobCard).join('') || '<div class="stc stq">No open jobs.</div>');
  }
  else if(sub === 'jobs'){
    var booked = (h.my_shows || []).filter(function(s){ return s.status !== 'invited'; });
    html = stfLab('Jobs') + ((h.my_jobs || []).map(stfMyJob).join('') || '<div class="stc stq">No jobs right now.</div>')
      + stfLab('Shows') + (booked.map(function(s){
          return '<div class="stc"><div class="t">' + esc(s.show) + ' · ' + esc(s.dept) + '</div><div class="s">'
            + (s.status === 'standby' ? 'Standby ' + (s.standby || '') : 'Booked') + ' · ' + esc(stfWhen(s.at)) + (s.amount ? ' · ' + vcs(s.amount) : '') + '</div></div>';
        }).join('') || '<div class="stc stq">Nothing booked.</div>');
  }
  else if(sub === 'pay'){
    html = stfPayBlock(h.pay) + stfLab('Recent') + ((h.pay.recent || []).map(function(r){
      return '<div class="stc strow"><div><div class="t">' + esc(r.reason || 'Pay') + '</div><div class="s">' + esc(stfWhen(r.at)) + '</div></div><b class="stvc">+' + Number(r.vc || 0).toLocaleString() + '</b></div>';
    }).join('') || '<div class="stc stq">Nothing yet.</div>')
      + '<div class="s" style="margin:10px 18px">Crew pay lands every Monday. A show pays when the producer pays it; a job when your lead approves it.</div>';
  }
  else if(sub === 'ladder') html = stfLadderHTML(h);
  else if(sub.indexOf('playbook:') === 0) html = stfPlaybookHTML(h, sub.slice(9));
  else if(sub === 'desks'){
    html = (stf.views || []).map(function(v){ return '<div class="v2wrap" data-stview="' + esc(v.key) + '">' + v2HTML(v.payload, 'view:' + v.key) + '</div>'; }).join('')
      || '<div class="empty">No dashboards for you. Leads and producers see theirs here.</div>';
  }
  else if(sub.indexOf('desk:') === 0){
    var key = sub.slice(5);
    var mine = (stf.views || []).filter(function(v){
      return v.key === key || (key.indexOf('desk:') === 0 && v.key.indexOf('show:') === 0 && v.dept_id && ('desk:' + v.dept_id) === key);
    });
    html = mine.map(function(v){ return '<div class="v2wrap" data-stview="' + esc(v.key) + '">' + v2HTML(v.payload, 'view:' + v.key) + '</div>'; }).join('')
      || '<div class="empty">That dashboard is gone.</div>';
  }
  el.innerHTML = html;
}

/* ── Discord messages, drawn in the app's look ─────────────────────────── */
function stfMd(s){
  var t = esc(String(s || '').replace(/​/g, ''));
  t = t.replace(/&lt;t:(\d+)(?::[a-zA-Z])?&gt;/g, function(_, n){ try{ return stfWhen(new Date(Number(n) * 1000).toISOString()); }catch(e){ return ''; } });
  t = t.replace(/&lt;a?:(\w+):(\d+)&gt;/g, '<img class="v2emo" alt="$1" src="https://cdn.discordapp.com/emojis/$2.webp?size=32">');
  t = t.replace(/&lt;@[!&amp;]?\d+&gt;/g, '@someone').replace(/&lt;#\d+&gt;/g, '#channel');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/__([^_]+)__/g, '<u>$1</u>')
       .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  return t.split('\n').map(function(line){
    if(/^### /.test(line)) return '<div class="v2h3">' + line.slice(4) + '</div>';
    if(/^## /.test(line)) return '<div class="v2h2">' + line.slice(3) + '</div>';
    if(/^# /.test(line)) return '<div class="v2h2">' + line.slice(2) + '</div>';
    if(/^-# /.test(line)) return '<div class="v2sub">' + line.slice(3) + '</div>';
    if(/^&gt; /.test(line)) return '<div class="v2q">' + line.slice(5) + '</div>';
    return line ? '<div>' + line + '</div>' : '<div class="v2gap"></div>';
  }).join('');
}
function v2Btn(b, src){
  var label = (b.emoji && b.emoji.name ? b.emoji.name + ' ' : '') + (b.label || '');
  if(b.style === 5 || b.url) return '<a class="v2b s5" href="' + esc(b.url) + '" target="_blank" rel="noopener">' + esc(label) + ' ↗</a>';
  return '<button class="v2b s' + (b.style || 2) + '" data-stpress="' + esc(b.custom_id) + '" data-stsrc="' + esc(src) + '"' + (b.disabled ? ' disabled' : '') + '>' + esc(label) + '</button>';
}
function v2Select(m, src){
  var multi = (m.max_values || 1) > 1;
  var opts = (m.options || []).map(function(o){
    return '<label class="v2opt' + (o.default ? ' on' : '') + '"><input type="' + (multi ? 'checkbox' : 'radio') + '" name="' + esc(m.custom_id) + '" value="' + esc(o.value) + '"' + (o.default ? ' checked' : '') + '>'
      + '<span><b>' + esc((o.emoji && o.emoji.name ? o.emoji.name + ' ' : '') + o.label) + '</b>' + (o.description ? '<em>' + esc(o.description) + '</em>' : '') + '</span></label>';
  }).join('');
  return '<div class="v2sel" data-stsel="' + esc(m.custom_id) + '" data-stsrc="' + esc(src) + '" data-multi="' + (multi ? 1 : 0) + '">'
    + '<div class="v2ph">' + esc(m.placeholder || 'Choose') + '</div>' + opts
    + (multi ? '<button class="v2b s1" data-stselgo="1">Done</button>' : '') + '</div>';
}
function v2Comp(c, src){
  if(!c) return '';
  switch(c.type){
    case 17: return '<div class="v2c" style="border-left-color:' + (c.accent_color != null ? '#' + ('000000' + Number(c.accent_color).toString(16)).slice(-6) : 'rgba(255,255,255,.2)') + '">' + (c.components || []).map(function(x){ return v2Comp(x, src); }).join('') + '</div>';
    case 10: return '<div class="v2t">' + stfMd(c.content) + '</div>';
    case 14: return c.divider === false ? '<div class="v2gap"></div>' : '<hr class="v2hr">';
    case 9: return '<div class="v2s"><div class="v2st">' + (c.components || []).map(function(x){ return v2Comp(x, src); }).join('') + '</div>'
      + (c.accessory ? (c.accessory.type === 2 ? v2Btn(c.accessory, src) : c.accessory.type === 11 && c.accessory.media ? '<img class="v2th" src="' + esc(c.accessory.media.url) + '" alt="">' : '') : '') + '</div>';
    case 1: return '<div class="v2row">' + (c.components || []).map(function(x){ return x.type === 2 ? v2Btn(x, src) : x.type === 3 ? v2Select(x, src) : ''; }).join('') + '</div>';
    case 12: return '<div class="v2gal">' + (c.items || []).map(function(it){ return it.media ? '<img src="' + esc(it.media.url) + '" alt="">' : ''; }).join('') + '</div>';
    case 11: return c.media ? '<img class="v2th" src="' + esc(c.media.url) + '" alt="">' : '';
    default: return '';
  }
}
function v2HTML(p, src){
  if(!p) return '';
  var html = '';
  if(p.content) html += '<div class="v2t v2plain">' + stfMd(p.content) + '</div>';
  (p.embeds || []).forEach(function(e){
    html += '<div class="v2c" style="border-left-color:' + (e.color != null ? '#' + ('000000' + Number(e.color).toString(16)).slice(-6) : 'rgba(255,255,255,.2)') + '">'
      + (e.title ? '<div class="v2h3">' + esc(e.title) + '</div>' : '') + (e.description ? '<div class="v2t">' + stfMd(e.description) + '</div>' : '')
      + (e.fields || []).map(function(f){ return '<div class="v2t"><b>' + esc(f.name) + '</b>' + stfMd(f.value) + '</div>'; }).join('')
      + (e.footer && e.footer.text ? '<div class="v2sub">' + esc(e.footer.text) + '</div>' : '') + '</div>';
  });
  (p.components || []).forEach(function(c){ html += v2Comp(c, src); });
  return html;
}

/* ── the panel: a screen or a form that a press answered with ──────────── */
function stfPanel(html){
  var el = document.getElementById('stpanel');
  if(!el) return;
  if(!html){ el.classList.remove('shown'); el.setAttribute('aria-hidden', 'true'); stf.panel = null; setTimeout(function(){ if(!stf.panel) el.innerHTML = ''; }, 220); return; }
  el.innerHTML = '<div class="stpbg" data-stclose="1"></div><div class="stpbox"><button class="stpx" data-stclose="1" aria-label="Close">×</button>' + html + '</div>';
  el.setAttribute('aria-hidden', 'false');
  void el.offsetHeight;
  el.classList.add('shown');
}
function stfShowView(view){
  stf.panel = { kind: 'view', payload: view };
  stfPanel(v2HTML(view, 'panel'));
}
function stfModalInputs(modal){
  var list = [];
  (function walk(cs, label){ (cs || []).forEach(function(c){
    if(c.type === 4) list.push({ c: c, label: c.label || label || '' });
    else if(c.type === 18) walk([c.component], c.label);
    else walk(c.components, label);
  }); })(modal.components);
  return list;
}
function stfShowModal(modal){
  stf.panel = { kind: 'modal', modal: modal };
  var inputs = stfModalInputs(modal);
  var html = '<div class="v2h2" style="margin-bottom:10px">' + esc(modal.title || 'Form') + '</div><form data-stform="' + esc(modal.custom_id) + '">'
    + inputs.map(function(x, i){
      var c = x.c, id = 'stf' + i;
      var attrs = ' id="' + id + '" name="' + esc(c.custom_id) + '"' + (c.required !== false ? ' required' : '') + (c.max_length ? ' maxlength="' + c.max_length + '"' : '') + (c.min_length ? ' minlength="' + c.min_length + '"' : '') + ' placeholder="' + esc(c.placeholder || '') + '"';
      return '<label class="stfl" for="' + id + '">' + esc(x.label) + '</label>'
        + (c.style === 2 ? '<textarea rows="5"' + attrs + '>' + esc(c.value || '') + '</textarea>' : '<input type="text"' + attrs + ' value="' + esc(c.value || '') + '">');
    }).join('')
    + '<div class="sterr" id="sterr"></div><button type="submit" class="v2b s1 stsubmit">Send</button></form>';
  stfPanel(html);
}

/* ── pressing ──────────────────────────────────────────────────────────── */
async function stfPress(cid, kind, values, fields, message, btn){
  if(stf.busy) return;
  stf.busy = true;
  busy(btn, true);
  var id = await rpc('app_staff_press', { p_custom_id: cid, p_kind: kind || 'button', p_values: values || [], p_fields: fields || {}, p_message: message || null });
  if(!id || typeof id !== 'string'){
    stf.busy = false; busy(btn, false);
    toast((id && id.message) || 'Could not send that. Try again.', true); return;
  }
  var row = null;
  for(var n = 0; n < 60; n++){
    await new Promise(function(r){ setTimeout(r, n < 10 ? 500 : 1000); });
    var got = await qMe('staff_presses?id=eq.' + id + '&select=status,result');
    row = got && got[0];
    if(row && (row.status === 'done' || row.status === 'failed')) break;
  }
  stf.busy = false; busy(btn, false);
  if(!row || (row.status !== 'done' && row.status !== 'failed')){ toast('The bot is slow to answer. Check again in a moment.', true); return; }
  var res = row.result || {};
  if(row.status === 'failed'){ toast(res.error || 'That did not work.', true); return; }
  (res.notes || []).forEach(function(t){ toast(stfPlain(t)); });
  if(res.modal){ stfShowModal(res.modal); return; }
  var v = res.view;
  var interactive = v && JSON.stringify(v).indexOf('"custom_id"') !== -1;
  var bigger = v && ((v.components && v.components.length) || (v.embeds && v.embeds.length));
  if(v && (interactive || bigger)) stfShowView(v);
  else { stfPanel(null); if(v && v.content) toast(stfPlain(v.content)); }
  await stfLoad(); stfPaint();
}
function stfPlain(s){ return String(s || '').replace(/​/g, '').replace(/[*_`]|^#+ |^-# /gm, '').replace(/<a?:\w+:\d+>/g, '').trim(); }
function stfSourceMessage(src){
  if(src === 'panel') return stf.panel && stf.panel.payload ? stf.panel.payload : null;
  if(src && src.indexOf('view:') === 0){
    var key = src.slice(5);
    var v = (stf.views || []).filter(function(x){ return x.key === key; })[0];
    return v ? v.payload : null;
  }
  return null;
}

document.addEventListener('click', function(e){
  if(!document.getElementById('stb')) return;
  var s = e.target.closest('[data-stsub]');
  if(s){ e.preventDefault(); openSheet({ kind: 'staff', sub: s.getAttribute('data-stsub') }); return; }
  if(e.target.closest('[data-stclose]')){ stfPanel(null); return; }
  var dr = e.target.closest('[data-stdrop]');
  if(dr){
    stf.panel = { kind: 'confirm' };
    stfPanel('<div class="v2h2">Drop ' + esc(dr.getAttribute('data-sttitle')) + '?</div><div class="v2t">It goes back up for somebody else and your lead is told. A drop is never a no-show.</div>'
      + '<div class="v2row">' + '<button class="v2b s4" data-stpress="job_drop:' + esc(dr.getAttribute('data-stdrop')) + '">Drop it</button><button class="v2b s2" data-stclose="1">Keep it</button></div>');
    return;
  }
  var go = e.target.closest('[data-stselgo]');
  if(go){
    var box = go.closest('[data-stsel]');
    var vals = Array.prototype.map.call(box.querySelectorAll('input:checked'), function(i){ return i.value; });
    stfPress(box.getAttribute('data-stsel'), 'select', vals, null, stfSourceMessage(box.getAttribute('data-stsrc')), go);
    return;
  }
  var p = e.target.closest('[data-stpress]');
  if(p && !p.disabled){
    e.preventDefault();
    stfPress(p.getAttribute('data-stpress'), 'button', null, null, stfSourceMessage(p.getAttribute('data-stsrc')), p);
  }
});
document.addEventListener('change', function(e){
  var box = e.target.closest && e.target.closest('[data-stsel]');
  if(!box || box.getAttribute('data-multi') === '1') {
    if(box){ Array.prototype.forEach.call(box.querySelectorAll('.v2opt'), function(l){ l.classList.toggle('on', l.querySelector('input').checked); }); }
    return;
  }
  stfPress(box.getAttribute('data-stsel'), 'select', [e.target.value], null, stfSourceMessage(box.getAttribute('data-stsrc')), null);
});
document.addEventListener('submit', function(e){
  var f = e.target.closest && e.target.closest('[data-stform]');
  if(!f) return;
  e.preventDefault();
  var fields = {};
  Array.prototype.forEach.call(f.querySelectorAll('input,textarea'), function(i){ fields[i.name] = i.value; });
  stfPress(f.getAttribute('data-stform'), 'modal', [], fields, null, f.querySelector('.stsubmit'));
});

/* The dashboards redraw live: the bot rewrites staff_views whenever it
   redraws the Discord card, and realtime tells this screen at once. */
function stfRealtime(){
  if(stf.rt || !session) return;
  if(!window.supabase || !window.supabase.createClient){
    if(document.getElementById('sb-rt')) return setTimeout(stfRealtime, 800);
    var sc = document.createElement('script');
    sc.id = 'sb-rt'; sc.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    sc.onload = stfRealtime; document.head.appendChild(sc); return;
  }
  try{
    var sb = window.supabase.createClient(SB, KEY, { auth: { persistSession: false } });
    sb.realtime.setAuth(session.access_token);
    stf.rt = sb.channel('staff-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_views' }, async function(){
        if(!document.getElementById('stb')){ try{ stf.rt.unsubscribe(); }catch(e){} stf.rt = null; return; }
        var got = await qMe('staff_views?select=key,audience,dept_id,sort,payload,updated_at&order=sort.asc');
        if(got){ stf.views = got; if(!stf.panel) stfPaint(); }
      }).subscribe();
  }catch(e){ stf.rt = null; }
}

/* The You tab's row: only for somebody on staff. Filled after the rest of the
   tab has drawn, so a slow read never holds up the career block. */
async function stfYouRow(){
  var slot = document.getElementById('me-staff');
  if(!slot || !me) return;
  var h = await rpc('app_staff_home');
  if(!slot.isConnected || !h || !h.me) return;
  var waiting = (h.my_jobs || []).length + (h.pay.pending || []).length + (h.my_shows || []).filter(function(s){ return s.status === 'invited'; }).length;
  slot.innerHTML = mrow('🎬', 'staff', 'Staff', (h.depts || []).map(function(d){ return d.name; }).join(' · ') || 'Your staff work',
    waiting ? waiting + ' waiting' : ((h.calls || []).length + (h.open_jobs || []).length) + ' open', waiting ? 'g' : 'q');
}
