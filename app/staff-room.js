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

/* The crew's words -- a COPY of vga-systems bot/src/lib/crew-words.js WORDS
   (staff plan S44: Apply > Request > Booked > Submit > Claim). The app must say
   exactly what Discord says, one word per moment; change both together. The
   retired words ("I'm in", "I want it", "Hand in", "hands up", "Assign") must
   never appear here. */
var CREW = { request: '\u270B Request', requested: 'Requested', booked: 'Booked', submit: 'Submit', submitAgain: 'Submit again',
  accept: 'Accept', backup: 'Backup', out: "I'm out", free: "I'm free if needed", cant: 'Can\u2019t', drop: 'Drop it', claim: 'Claim' };

/* Which hat this person wears, for the title and the order of the room:
   a producer (the Production Manager role, mirrored to production_managers),
   a lead of any department, or crew. */
function stfRole(h){
  if(!h || !h.me) return 'Staff';
  if(h.me.producer) return 'Producer';
  return (h.depts || []).some(function(d){ return d.role === 'lead'; }) ? 'Lead' : 'Crew';
}


/* app_staff_home() answers NULL for somebody who is not on staff, and the
   shared rpc() turns a null answer into "No answer from the server" -- which
   would tell a fan the app is broken. So this read tells the two apart. */
async function stfHome(){
  if(!session) return null;
  if(!(await ensureFreshSession())) return { ok:false, message:'Your session expired. Sign in again.' };
  try{
    var r = await fetch(SB + '/rest/v1/rpc/app_staff_home', { method:'POST',
      headers:{ apikey: KEY, Authorization:'Bearer ' + session.access_token, 'Content-Type':'application/json' }, body:'{}' });
    if(!r.ok) return { ok:false, message:"Couldn't load your staff work (" + r.status + ")." };
    var j = await r.json();
    return j && j.me ? j : null;
  }catch(e){ return { ok:false, message:'No connection. Try again.' }; }
}
async function stfLoad(){
  var got = await Promise.all([ stfHome(), qMe('staff_views?select=key,audience,dept_id,sort,payload,updated_at&order=sort.asc') ]);
  stf.home = got[0];
  stf.views = got[1] || [];
  /* Mission Control is the producer's (mission-control.js); nobody else asks. */
  if(stf.home && stf.home.me && stf.home.me.producer && typeof mcLoad === 'function') mc.data = await mcLoad();
}


/* ── THE ROOM AS A GIG APP (redrawn 2026-10-18) ─────────────────────────
   Settled with Castle after research into the apps that do this for a living:
   · a MONEY PILL in the header on every screen (Uber's earnings pill) — green
     with the amount when there is pay to claim, quiet otherwise; it opens Money;
   · TABS instead of one long scroll: Today, Open, Schedule, Levels, and Desk
     for leads and producers. A red count on a tab means something there needs
     you; a grey one is just how many;
   · open work drawn as SHIFTS with a day block (Deputy), and a tag that says
     how you get it — your lead picks;
   · a LEVEL CARD per department with a tick for each requirement of the next
     rung (DoorDash Top Dasher, Fiverr seller levels), its playbook inside it.
   Nothing here is gold: nothing in this room spends VC. Claim is green (money
   coming in); everything you ask for is lavender; the rest is an outline. */
var STF_TABS = ['home', 'open', 'jobs', 'ladder', 'desks'];
var RUNG_WORD = { onboarded:'Onboarded', tryout:'Tryout · half pay', full_time:'Full time', instructor:'Instructor', lead:'Lead', signup:'Signed up' };

function stfWhen(iso){
  if(!iso) return '';
  try{ return new Date(iso).toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZone:'America/New_York' }) + ' ET'; }
  catch(e){ return ''; }
}
function stfDate(iso){
  try{ return new Date(iso).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', timeZone:'America/New_York' }); }
  catch(e){ return ''; }
}
function vcs(n){ return Number(n || 0).toLocaleString() + ' VC'; }
function stfLate(iso){ return !!iso && new Date(iso).getTime() < Date.now(); }
/* How late, in words a person says: "2 days late", "5 hours late". */
function stfLateBy(iso){
  var h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if(h < 24) return Math.max(1, h) + (h === 1 ? ' hour' : ' hours') + ' late';
  var d = Math.floor(h / 24);
  return d + (d === 1 ? ' day' : ' days') + ' late';
}
function stfJobDone(j){ return j.status === 'published' || (j.review && j.review.status === 'approved'); }

/* ── pieces ─────────────────────────────────────────────────────────────── */
function stfBtn(cid, label, cls, extra){
  return '<button class="sgb ' + (cls || '') + '" data-stpress="' + esc(cid) + '"' + (extra || '') + '>' + esc(label) + '</button>';
}
function stfSec(t, cls, link, linkSub){
  return '<div class="sgsec"><b class="' + (cls || '') + '">' + esc(t) + '</b><i></i>'
    + (link ? '<a href="#" data-stsub="' + esc(linkSub) + '">' + esc(link) + ' ›</a>' : '') + '</div>';
}
/* A day block, the way a calendar app marks a shift: weekday over the date. */
function stfDay(iso, cls){
  if(!iso) return '<div class="sgday ' + (cls || '') + '"><s>ANY</s><b>—</b></div>';
  var d = new Date(iso), wd = '', dn = '';
  try{
    wd = d.toLocaleDateString('en-US', { weekday:'short', timeZone:'America/New_York' }).toUpperCase();
    dn = d.toLocaleDateString('en-US', { day:'numeric', timeZone:'America/New_York' });
  }catch(e){}
  return '<div class="sgday ' + (cls || '') + '"><s>' + esc(wd) + '</s><b>' + esc(dn) + '</b></div>';
}
function stfIcon(sym, cls){ return '<div class="sgday ' + (cls || '') + '"><s>&nbsp;</s><b>' + sym + '</b></div>'; }
/* One shift row: the day block, what it is, and on the right the pay and the
   one button. `extra` is anything under the line: a tag, a brief, actions. */
function stfShift(day, title, meta, right, extra){
  return '<div class="sgsft">' + day + '<div class="sgtx"><div class="t">' + title + '</div><div class="m">' + meta + '</div>' + (extra || '') + '</div>'
    + (right ? '<div class="sgrt">' + right + '</div>' : '') + '</div>';
}
function stfHow(t, cls){ return '<span class="sghow ' + (cls || '') + '">' + esc(t) + '</span>'; }
function stfCalm(html){ return '<p class="sgnote">' + html + '</p>'; }

/* ── the cards, one per kind of work ───────────────────────────────────── */
function stfCallRow(c, depts){
  var d = (depts || []).filter(function(x){ return x.id === c.dept_id; })[0] || {};
  var backup = d.rung === 'onboarded';
  /* app_staff_home returns needed: null once a call is crewed; "null seats"
     used to be printed straight onto the card. */
  var seats = c.needed == null ? '' : ' · ' + c.needed + (c.needed === 1 ? ' seat' : ' seats');
  var meta = esc(c.dept) + ' · ' + esc(stfWhen(c.at)) + seats + (c.status === 'crewed' ? ' · crewed' : '')
    + (c.hands ? ' · ' + c.hands + (c.hands === 1 ? ' request' : ' requests') : '');
  /* The same buttons as the call post (bot/src/lib/call-buttons.js): Request —
     "I'm free if needed" once it is booked — Backup, and I'm out. A call stays
     answerable after the pick on purpose; it closes at delivered. */
  var open = c.status === 'calling' || c.status === 'crewed', right = '', below = '';
  if(c.mine === 'in'){ right = '<span class="sgok">' + CREW.requested + '</span>'; below = '<div class="sgacts">' + stfBtn('prod_out:' + c.pd_id, CREW.out, 'no') + '</div>'; }
  else if(c.mine === 'booked' || c.mine === 'confirmed'){ right = '<span class="sgok">' + CREW.booked + '</span>'; below = '<div class="sgacts">' + stfBtn('prod_out:' + c.pd_id, CREW.out, 'no') + '</div>'; }
  else if(c.mine === 'standby'){ right = '<span class="sgok">Backup</span>'; below = '<div class="sgacts">' + stfBtn('prod_out:' + c.pd_id, CREW.out, 'no') + '</div>'; }
  else if(c.mine === 'invited'){ below = '<div class="sgacts">' + stfBtn('inv_yes:' + c.mine_id, CREW.accept, 'lav full') + stfBtn('inv_no:' + c.mine_id, CREW.cant, 'no') + '</div>'; }
  else if(open){
    right = backup ? '' : stfBtn('prod_in:' + c.pd_id, c.status === 'crewed' ? CREW.free : CREW.request, 'lav');
    below = '<div class="sgacts">' + stfBtn('prod_backup:' + c.pd_id, CREW.backup, 'no') + '</div>';
  }
  else right = '<span class="sgq">Closed</span>';
  return stfShift(stfDay(c.at), esc(c.show) + ' · ' + esc(c.dept), meta,
    '<span class="sgvc">' + Number(c.rate || 0).toLocaleString() + '</span>' + right,
    stfHow(c.mine === 'invited' ? 'Invite' : 'Lead picks', c.mine === 'invited' ? 'inv' : 'lp')
    + (backup && open && !c.mine ? '<div class="m">You\'re onboarded: Backup puts you on the list. Your first booking makes you a tryout.</div>' : '')
    + below);
}
function stfOpenJobRow(j){
  var meta = esc(j.dept) + (j.show ? ' · ' + esc(j.show) : '') + (j.asks ? ' · ' + j.asks + (j.asks === 1 ? ' request' : ' requests') : ' · nobody yet');
  var right = '<span class="sgvc">' + Number(j.rate || 0).toLocaleString() + '</span>'
    + (j.mine === 'in' ? '<span class="sgok">' + CREW.requested + '</span>' : stfBtn('job_take:' + j.id, CREW.request, 'lav'));
  return stfShift(stfDay(j.due), esc(j.title), meta, right, stfHow('Lead picks', 'lp')
    + (j.brief ? '<div class="sgbrief">' + esc(j.brief) + '</div>' : ''));
}
/* My job: where it is, and the one thing to do with it. */
function stfMyJobRow(j){
  var r = j.review;
  if(stfJobDone(j)) return stfShift(stfIcon('✓', 'done'), esc(j.title), esc(j.dept) + ' · approved', j.amount ? '<span class="sgvc g">+' + Number(j.amount).toLocaleString() + '</span>' : '');
  var submitted = r && r.status === 'submitted', sent = r && r.status === 'revise';
  var late = !submitted && stfLate(j.due);
  var meta = esc(j.dept) + (j.show ? ' · ' + esc(j.show) : '') + ' · '
    + (submitted ? 'submitted · round ' + r.round + ' · waiting for your lead'
      : sent ? '<span class="late">sent back</span>' + (r.note ? ': ' + esc(r.note) : '')
      : late ? '<span class="late">' + stfLateBy(j.due) + '</span>'
      : (j.due ? 'due ' + esc(stfDate(j.due)) : 'in progress'));
  var acts = submitted ? '' : '<div class="sgacts">' + stfBtn('job_handin:' + j.crew_id, sent ? CREW.submitAgain : CREW.submit, 'lav full')
    + '<button class="sgb no" data-stdrop="' + esc(j.crew_id) + '" data-sttitle="' + esc(j.title) + '">' + CREW.drop + '…</button></div>';
  return stfShift(stfDay(j.due, late ? 'late' : submitted ? '' : 'now'), esc(j.title), meta,
    j.amount ? '<span class="sgvc">' + Number(j.amount).toLocaleString() + '</span>' : '',
    (j.brief && !submitted ? '<div class="sgbrief">' + esc(j.brief) + '</div>' : '') + acts);
}
function stfInviteRow(s){
  return stfShift(stfDay(s.at), esc(s.show) + ' · ' + esc(s.dept), 'Your lead invited you · ' + esc(stfWhen(s.at)),
    s.amount ? '<span class="sgvc">' + Number(s.amount).toLocaleString() + '</span>' : '',
    stfHow('Invite', 'inv') + '<div class="sgacts">' + stfBtn('inv_yes:' + s.crew_id, CREW.accept, 'lav full') + stfBtn('inv_no:' + s.crew_id, CREW.cant, 'no') + '</div>');
}
function stfShowRow(s){
  return stfShift(stfDay(s.at), esc(s.show) + ' · ' + esc(s.dept),
    (s.status === 'standby' ? 'Backup ' + (s.standby || '') : 'Booked') + ' · ' + esc(stfWhen(s.at)),
    s.amount ? '<span class="sgvc">' + Number(s.amount).toLocaleString() + '</span>' : '');
}
function stfClaimRow(r){
  return stfShift(stfIcon('$', 'cash'), 'Claim ' + Number(r.vc || 0).toLocaleString() + ' VC', esc(r.reason || 'Pay'), stfBtn('reward_claim:' + r.id, CREW.claim, 'go'));
}

/* ── levels: a card per department, a tick per requirement ──────────────── */
function stfLevel(d){
  var vetRung = d.rung === 'full_time' || d.rung === 'instructor' || d.rung === 'lead';
  var vet = vetRung && d.delivered >= 10;
  var clean = !d.no_shows;
  var tag = { onboarded:['ONBOARDED',''], tryout:['TRYOUT','tr'], full_time:['FULL TIME','ft'], instructor:['INSTRUCTOR','ft'], lead:['LEAD','ld'] }[d.rung] || [String(d.rung || '').toUpperCase(), ''];
  var next, items;
  if(d.rung === 'onboarded'){
    next = 'Tryout: your first booking';
    items = [[false, 'Get booked on a show or a job']];
  } else if(d.rung === 'tryout'){
    next = 'Full time: full pay';
    items = [[true, 'Booked once'], [d.delivered >= 3, '3 delivered', Math.min(100, d.delivered / 3 * 100), Math.min(d.delivered, 3) + '/3'], [clean, clean ? 'No no-shows' : d.no_shows + ' no-show · two takes you off']];
  } else if(vet){
    next = 'Veteran reached: 1.2× pay';
    items = [[true, RUNG_WORD[d.rung] || d.rung], [true, '10 delivered', 100, d.delivered + ''], [clean, clean ? 'No no-shows' : d.no_shows + ' no-show · two takes you off']];
  } else {
    next = 'Veteran: 1.2× pay';
    items = [[true, RUNG_WORD[d.rung] || d.rung], [false, '10 delivered', d.delivered * 10, d.delivered + '/10'], [clean, clean ? 'No no-shows' : d.no_shows + ' no-show · two takes you off']];
  }
  var pb = d.playbook || {};
  var written = pb.text || (Array.isArray(pb.links) && pb.links.length);
  return '<div class="sglv"><div class="h"><b>' + esc(d.name) + '</b><span class="' + tag[1] + '">' + tag[0] + '</span>'
    + (vet ? '<span class="vet">VETERAN</span>' : '') + '<em>' + d.delivered + ' delivered</em></div>'
    + '<div class="goal">Next: <b>' + esc(next) + '</b></div>'
    + '<ul class="sgck">' + items.map(function(it){
        return '<li class="' + (it[0] ? 'y' : 'n') + '"><i>' + (it[0] ? '✓' : '') + '</i>' + esc(it[1])
          + (it[2] != null ? '<span class="bar"><b style="width:' + Math.round(it[2]) + '%"></b></span>' : '')
          + (it[3] ? '<span class="pr">' + esc(it[3]) + '</span>' : '') + '</li>'; }).join('') + '</ul>'
    + '<a href="#" class="pb" data-stsub="playbook:' + esc(d.id) + '">How ' + esc(d.name) + ' works<span>'
    + (written ? 'read ›' : d.role === 'lead' ? 'write it ›' : 'not written yet ›') + '</span></a></div>';
}
/* The one level-up that is closest, for Today. Smallest number still to do. */
function stfClosest(depts){
  var best = null;
  (depts || []).forEach(function(d){
    var left, what;
    if(d.rung === 'onboarded'){ left = 1; what = 'your first booking makes you a tryout'; }
    else if(d.rung === 'tryout'){ left = Math.max(0, 3 - d.delivered); what = left + ' more ' + (left === 1 ? 'show' : 'shows') + ' and you’re on full pay'; }
    else if(d.delivered < 10){ left = 10 - d.delivered; what = left + ' more delivered for Veteran: 1.2× pay'; }
    else return;
    if(!best || left < best.left) best = { left: left, what: what, d: d };
  });
  return best;
}

/* ── the screens ────────────────────────────────────────────────────────── */
function stfWaiting(h){
  var jobs = (h.my_jobs || []).filter(function(j){ return !stfJobDone(j) && !(j.review && j.review.status === 'submitted'); });
  var late = jobs.filter(function(j){ return stfLate(j.due) || (j.review && j.review.status === 'revise'); });
  var invites = (h.my_shows || []).filter(function(s){ return s.status === 'invited'; });
  var claims = (h.pay && h.pay.pending) || [];
  return { jobs: jobs, late: late, invites: invites, claims: claims, n: late.length + invites.length + (claims.length ? 1 : 0) };
}
function stfTodayHTML(h){
  var w = stfWaiting(h), html = '';
  var claimSum = w.claims.reduce(function(a, r){ return a + Number(r.vc || 0); }, 0);
  var parts = [];
  if(claimSum) parts.push(claimSum.toLocaleString() + ' VC to claim');
  if(w.late.length) parts.push(w.late.length === 1 ? 'one job is late' : w.late.length + ' jobs are late');
  if(w.invites.length) parts.push(w.invites.length === 1 ? 'one invite to answer' : w.invites.length + ' invites to answer');
  var openN = (h.calls || []).length + (h.open_jobs || []).length;
  var ban = w.n
    ? '<div class="sptx"><div class="k"><em class="r">' + w.n + '</em> ' + (w.n === 1 ? 'THING NEEDS' : 'THINGS NEED') + ' YOU</div>'
      + '<div class="s">' + esc(parts.join(', ').replace(/^./, function(c){ return c.toUpperCase(); })) + '.</div></div>'
    : '<div class="sptx"><div class="k">ALL <em>CLEAR</em></div><div class="s">Nothing needs you.'
      + (openN ? ' ' + openN + ' open in your departments.' : '') + '</div></div>';
  html += spBan(ban, true);
  /* A producer's room opens on Mission Control: every coming show at a glance. */
  if(h.me && h.me.producer && typeof mcTile === 'function') html += '<div class="sgmc">' + mcTile() + '</div>';

  if(w.n){
    html += stfSec('Needs you', 'r');
    html += w.late.map(stfMyJobRow).join('') + w.invites.map(stfInviteRow).join('') + w.claims.map(stfClaimRow).join('');
  }
  /* jobs in progress that are not late yet */
  var doing = w.jobs.filter(function(j){ return w.late.indexOf(j) < 0; });
  if(doing.length) html += stfSec('In progress', '', doing.length > 1 ? 'All ' + doing.length : '', 'jobs') + stfMyJobRow(doing[0]);

  var first = (h.calls || []).slice(0, 1).map(function(c){ return stfCallRow(c, h.depts); })
    .concat((h.open_jobs || []).slice(0, (h.calls || []).length ? 1 : 2).map(stfOpenJobRow));
  html += stfSec('Open work', '', openN > first.length ? 'All ' + openN : '', 'open')
    + (first.join('') || stfCalm('No open calls or jobs in your departments right now.'));

  var booked = (h.my_shows || []).filter(function(s){ return s.status !== 'invited'; });
  html += stfSec('Next up', '', booked.length > 1 ? 'Schedule' : '', 'jobs')
    + (booked[0] ? stfShowRow(booked[0]) : stfCalm('Nothing booked yet. Request something above.'));

  var c = stfClosest(h.depts);
  if(c) html += stfSec('Closest level-up', '', 'Levels', 'ladder')
    + stfShift(stfIcon('↑', 'now'), esc(c.d.name), esc(c.what));
  return html;
}
function stfOpenHTML(h){
  return stfCalm('Shows and jobs in your departments. <b>Lead picks</b>: your request goes to the lead, who books who gets it.')
    + stfSec('Jobs') + (((h.open_jobs || []).map(stfOpenJobRow).join('')) || stfCalm('No open jobs.'))
    + stfSec('Show calls') + (((h.calls || []).map(function(c){ return stfCallRow(c, h.depts); }).join('')) || stfCalm('No open calls.'));
}
function stfScheduleHTML(h){
  var w = stfWaiting(h), html = '';
  var all = h.my_jobs || [];
  var waitingReview = all.filter(function(j){ return j.review && j.review.status === 'submitted' && !stfJobDone(j); });
  var doing = w.jobs.filter(function(j){ return w.late.indexOf(j) < 0; });
  var done = all.filter(stfJobDone);
  var booked = (h.my_shows || []).filter(function(s){ return s.status !== 'invited'; });
  if(w.late.length) html += stfSec('Late', 'r') + w.late.map(stfMyJobRow).join('');
  if(w.invites.length) html += stfSec('Invites') + w.invites.map(stfInviteRow).join('');
  if(doing.length) html += stfSec('To do') + doing.map(stfMyJobRow).join('');
  if(waitingReview.length) html += stfSec('Waiting for review') + waitingReview.map(stfMyJobRow).join('');
  html += stfSec('Booked shows') + (booked.map(stfShowRow).join('') || stfCalm('Nothing booked.'));
  if(done.length) html += stfSec('Approved') + done.map(stfMyJobRow).join('');
  if(!w.late.length && !w.invites.length && !doing.length && !waitingReview.length && !done.length)
    html = stfCalm('No jobs right now. Open has work in your departments.') + html;
  return html;
}
/* Money: the pill, opened. What is ready, the month, a bar per week from the
   recent pay, and the history. */
function stfMoneyHTML(h){
  var pend = h.pay.pending || [];
  var sum = pend.reduce(function(a, r){ return a + Number(r.vc || 0); }, 0);
  var html = '<div class="sgbig"><div class="k">READY TO CLAIM</div><div class="n' + (sum ? ' g' : '') + '">' + sum.toLocaleString() + ' VC</div></div>'
    + pend.map(stfClaimRow).join('')
    + '<div class="sgbig"><div class="k">THIS MONTH</div><div class="n">' + Number(h.pay.month || 0).toLocaleString() + '</div></div>';
  /* Weeks start Monday, the day crew pay lands. */
  var weeks = {}, order = [];
  (h.pay.recent || []).forEach(function(r){
    var d = new Date(r.at); if(isNaN(d)) return;
    var day = (d.getUTCDay() + 6) % 7, mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
    var k = mon.toISOString().slice(0, 10);
    if(!weeks[k]){ weeks[k] = 0; order.push(k); }
    weeks[k] += Number(r.vc || 0);
  });
  order.sort();
  if(order.length){
    var max = Math.max.apply(null, order.map(function(k){ return weeks[k]; })) || 1;
    html += '<div class="sgchart">' + order.slice(-5).map(function(k, i, arr){
      var label = new Date(k + 'T12:00:00Z').toLocaleDateString('en-US', { month:'short', day:'numeric', timeZone:'UTC' }).toUpperCase();
      return '<div class="c"><b>' + weeks[k].toLocaleString() + '</b><i class="' + (i === arr.length - 1 ? 'cur' : '') + '" style="height:' + Math.max(6, Math.round(weeks[k] / max * 72)) + '%"></i><s>WK OF ' + esc(label) + '</s></div>'; }).join('') + '</div>';
  }
  html += stfSec('Recent') + ((h.pay.recent || []).map(function(r){
      return '<div class="sghist"><div class="sgtx"><div class="t">' + esc(r.reason || 'Pay') + '</div><div class="m">' + esc(stfDate(r.at)) + '</div></div><span class="sgvc g">+' + Number(r.vc || 0).toLocaleString() + '</span></div>';
    }).join('') || stfCalm('Nothing yet.'))
    + stfCalm('Crew pay lands every Monday. A show pays when the producer pays it; a job when your lead approves it.');
  return html;
}
function stfLevelsHTML(h){
  return stfCalm('Each department is its own level. Two no-shows in one takes you off it; a drop isn’t a no-show, but your lead sees it. A cancelled job never counts.')
    + (h.depts || []).map(stfLevel).join('');
}
function stfPlaybookHTML(h, id){
  var d = (h.depts || []).filter(function(x){ return x.id === id; })[0];
  if(!d) return stfCalm('That department is gone.');
  var pb = d.playbook || {};
  var links = Array.isArray(pb.links) ? pb.links : [];
  if(!pb.text && !links.length){
    var desk = (stf.views || []).filter(function(v){ return v.key === 'desk:' + id; })[0];
    return d.role === 'lead'
      ? '<div class="sgcalm"><b>Not written yet</b>You lead ' + esc(d.name) + ', so this one’s yours: the rules, how work runs here, and the links your crew needs.'
        + (desk ? '<div class="sgacts" style="justify-content:center"><a href="#" class="sgb lav" data-stsub="desk:' + esc(desk.key) + '">Write it on your desk</a></div>' : '') + '</div>'
      : '<div class="sgcalm"><b>Not written yet</b>Your lead is writing this. It shows up here when it’s done.</div>';
  }
  return '<div class="sgpb">' + (pb.text ? '<div class="stmd">' + stfMd(pb.text) + '</div>' : '')
    + (links.length ? stfSec('Links') + links.map(function(l){ return '<a class="stlk" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label || l.url) + '</a>'; }).join('') : '')
    + (pb.by ? '<div class="sgnote" style="margin:12px 0 0">Written by ' + esc(pb.by) + '</div>' : '') + '</div>';
}
function stfDesksHTML(list){
  return list.map(function(v){ return '<div class="v2wrap" data-stview="' + esc(v.key) + '">' + v2HTML(v.payload, 'view:' + v.key) + '</div>'; }).join('');
}

/* ── the frame: header with the money pill, the tabs, the screen ────────── */
function stfPill(h){
  if(!h || !h.me || !h.pay) return '';
  var sum = (h.pay.pending || []).reduce(function(a, r){ return a + Number(r.vc || 0); }, 0);
  return sum
    ? '<a href="#" class="sgpill cash" data-stsub="pay" aria-label="' + sum.toLocaleString() + ' VC to claim"><i>$</i>' + sum.toLocaleString() + '</a>'
    : '<a href="#" class="sgpill calm" data-stsub="pay">' + Number(h.pay.month || 0).toLocaleString() + ' this month</a>';
}
function stfTabsHTML(h){
  var w = stfWaiting(h);
  var openN = (h.calls || []).length + (h.open_jobs || []).length;
  var leadDesks = (stf.views || []).length;
  var T = [['home', 'Today', w.n, true], ['open', 'Open', openN, false], ['jobs', 'Schedule', w.late.length + w.invites.length, true], ['ladder', 'Levels', 0, false]];
  if(leadDesks) T.push(['desks', 'Desk', leadDesks, false]);
  return '<div class="sgtabs" role="tablist">' + T.map(function(t){
    return '<button role="tab" aria-selected="' + (stf.sub === t[0]) + '" class="' + (stf.sub === t[0] ? 'on' : '') + '" data-sttab="' + t[0] + '">' + t[1]
      + (t[2] ? '<em class="' + (t[3] ? '' : 'n') + '">' + t[2] + '</em>' : '') + '</button>'; }).join('') + '</div>';
}
function stfTitle(sub, h){
  if(sub === 'pay') return 'MONEY';
  if(sub.indexOf('playbook:') === 0){
    var d = ((h && h.depts) || []).filter(function(x){ return x.id === sub.slice(9); })[0];
    return d ? String(d.name).toUpperCase() : 'PLAYBOOK';
  }
  if(sub.indexOf('desk:') === 0) return 'DASHBOARD';
  return 'STAFF';
}

async function renderStaff(sub){
  stf.sub = sub || 'home';
  var body = document.getElementById('sheet-body');
  /* Mission Control keeps its own amber header (mission-control.js). */
  if(stf.sub === 'mission'){
    body.innerHTML = '<div class="evhead">' + backButton() + '<div style="height:34px"></div><div class="kick">You · Staff</div><h3>Mission Control</h3></div>'
      + '<div id="stb"><div class="skel" style="height:90px"></div></div><div id="stpanel" class="stpanel" aria-hidden="true"></div>';
  } else {
    body.innerHTML = '<div class="sgx"><div class="sghead">' + backButton() + '<div class="t" id="st-title">' + esc(stfTitle(stf.sub, stf.home)) + '</div><span id="st-pill"></span></div>'
      + '<div id="st-tabs"></div>'
      + '<div id="stb"><div class="skel" style="height:90px;margin:12px"></div><div class="skel" style="width:60%;margin:10px 12px"></div></div></div>'
      + '<div id="stpanel" class="stpanel" aria-hidden="true"></div>';
  }
  await stfLoad();
  stfPaint();
  stfRealtime();
}

/* Switching tabs redraws in place and REPLACES the history entry, so Back
   leaves the room rather than walking back through every tab you looked at. */
function stfTab(sub){
  stf.sub = sub;
  try{
    if(typeof sheetStack !== 'undefined' && sheetStack.length) sheetStack[sheetStack.length - 1].sub = sub;
    history.replaceState(history.state, '', hashFor({ kind: 'staff', sub: sub }));
  }catch(e){}
  var sh = document.getElementById('sheet'); if(sh) sh.scrollTop = 0;
  stfPaint();
}

function stfPaint(){
  var el = document.getElementById('stb');
  if(!el) return;
  var tabsEl = document.getElementById('st-tabs'), pillEl = document.getElementById('st-pill'), titleEl = document.getElementById('st-title');
  if(!me){ el.innerHTML = '<div class="sgcalm"><b>Sign in to see your staff work.</b>Your calls, jobs and pay live here.</div>'; return; }
  var h = stf.home;
  if(h && h.ok === false){ retryHandlers['staff'] = function(){ renderStaff(stf.sub); }; el.innerHTML = failHTML(h.message || "Couldn't load your staff work.", 'staff'); return; }
  if(!h){
    if(tabsEl) tabsEl.innerHTML = '';
    el.innerHTML = '<div class="sgcalm"><b>You’re not on staff.</b>Join through <b class="in">Join the VGA crew</b> in the UBA server. Your work shows up here the day you’re approved.</div>';
    return;
  }
  var sub = stf.sub, html = '';
  var tabbed = STF_TABS.indexOf(sub) >= 0 || sub.indexOf('desk:') === 0;
  if(titleEl) titleEl.textContent = stfTitle(sub, h);
  if(pillEl) pillEl.innerHTML = sub === 'pay' ? '' : stfPill(h);
  if(tabsEl) tabsEl.innerHTML = tabbed ? stfTabsHTML(h) : '';
  if(sub === 'home') html = stfTodayHTML(h);
  else if(sub === 'open') html = stfOpenHTML(h);
  else if(sub === 'jobs') html = stfScheduleHTML(h);
  else if(sub === 'pay') html = stfMoneyHTML(h);
  else if(sub === 'ladder') html = stfLevelsHTML(h);
  else if(sub === 'mission') html = typeof mcHTML === 'function' ? mcHTML() : '';
  else if(sub.indexOf('playbook:') === 0) html = stfPlaybookHTML(h, sub.slice(9));
  else if(sub === 'desks'){
    html = stfDesksHTML(stf.views || []) || '<div class="sgcalm"><b>No dashboards for you.</b>Leads and producers see theirs here.</div>';
  }
  else if(sub.indexOf('desk:') === 0){
    var key = sub.slice(5);
    var mine = (stf.views || []).filter(function(v){
      return v.key === key || (key.indexOf('desk:') === 0 && v.key.indexOf('show:') === 0 && v.dept_id && ('desk:' + v.dept_id) === key);
    });
    html = stfDesksHTML(mine) || '<div class="sgcalm"><b>That dashboard is gone.</b></div>';
  }
  el.innerHTML = html;
  if(typeof spDustRun === 'function') spDustRun();
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
  var tb = e.target.closest('[data-sttab]');
  if(tb){ e.preventDefault(); stfTab(tb.getAttribute('data-sttab')); return; }
  /* A link to another tab switches in place; anything else (Money, a
     playbook, one dashboard) is a page of its own that Back returns from. */
  var s = e.target.closest('[data-stsub]');
  if(s){
    e.preventDefault();
    var to = s.getAttribute('data-stsub');
    if(STF_TABS.indexOf(to) >= 0 && STF_TABS.indexOf(stf.sub) >= 0) stfTab(to);
    else openSheet({ kind: 'staff', sub: to });
    return;
  }
  if(e.target.closest('[data-stclose]')){ stfPanel(null); return; }
  var dr = e.target.closest('[data-stdrop]');
  if(dr){
    stf.panel = { kind: 'confirm' };
    stfPanel('<div class="v2h2">Drop ' + esc(dr.getAttribute('data-sttitle')) + '?</div><div class="v2t">It goes back up for somebody else and your lead is told. A drop is never a no-show.</div>'
      + '<div class="v2row">' + '<button class="v2b s4" data-stpress="job_drop:' + esc(dr.getAttribute('data-stdrop')) + '">' + CREW.drop + '</button><button class="v2b s2" data-stclose="1">Keep it</button></div>');
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
        /* A redrawn dashboard means a show changed: Mission Control re-reads too. */
        if(got && stf.home && stf.home.me && stf.home.me.producer && typeof mcLoad === 'function'){ var m = await mcLoad(); if(m) mc.data = m; }
        if(got){ stf.views = got; if(!stf.panel) stfPaint(); }
      }).subscribe();
  }catch(e){ stf.rt = null; }
}

/* The You tab's row: only for somebody on staff. Filled after the rest of the
   tab has drawn, so a slow read never holds up the career block. */
async function stfYouRow(){
  var slot = document.getElementById('me-staff');
  if(!slot || !me) return;
  var h = await stfHome();
  if(!slot.isConnected || !h || !h.me) return;
  var waiting = (h.my_jobs || []).filter(function(j){ return !stfJobDone(j) && !(j.review && j.review.status === 'submitted'); }).length + (h.pay.pending || []).length + (h.my_shows || []).filter(function(s){ return s.status === 'invited'; }).length;
  var role = stfRole(h);
  slot.innerHTML = mrow('🎬', 'staff', role === 'Crew' ? 'Staff' : 'Staff · ' + role, (h.depts || []).map(function(d){ return d.name; }).join(' · ') || 'Your staff work',
    waiting ? waiting + ' waiting' : ((h.calls || []).length + (h.open_jobs || []).length) + ' open', waiting ? 'g' : 'q');
}
