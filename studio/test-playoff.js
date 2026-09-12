/* Tests for playoff-core.js — the UBAe seeding / play-in / bye rules.
   Run:  node studio/test-playoff.js
   Add a case whenever a rule in docs/ubae-plan.md "Playoffs" changes. */
const P=require('./playoff-core.js')

let n=0, bad=0
const eq=(got,want,what)=>{ n++
  const g=JSON.stringify(got), w=JSON.stringify(want)
  if(g!==w){ bad++; console.log(`  ✗ ${what}\n      got  ${g}\n      want ${w}`) }
}

const T=(name,conf,w,l,bw,bl)=>({team_name:name,conference:conf,match_wins:w,match_losses:l,
  match_draws:0,bouts_won:bw,bouts_lost:bl,bout_diff:bw-bl})

// The real Summer Split table going into the final match (UKFC UNCS v Ring
// Reapers, Aug 22) — the night this screen was built for.
const SUMMER=[
  T('Champions United','A',4,1,12,8),
  T('Sheath Elite','A',3,2,10,7),
  T('UKFC UNCS','A',2,2,8,5),
  T('jUnC','A',1,4,4,14),
  T('Team MUDS','B',3,2,12,8),
  T('Team Rag Tags','B',3,2,10,8),
  T('The 5 Great Kage','B',2,3,10,11),
  T('Ring Reapers','B',1,3,6,11),
]
const names=list=>list.map(t=>t.team_name)
const pi=p=>p.playin.map(m=>m.map(t=>t.team_name))

console.log('\nUBAe playoff picture\n')

// 1 — as it stands, with one match still to play
{
  const p=P.picture(SUMMER)
  eq(names(p.confs.A),['Champions United','Sheath Elite','UKFC UNCS','jUnC'],'conference A order')
  eq(names(p.confs.B),['Team MUDS','Team Rag Tags','The 5 Great Kage','Ring Reapers'],'conference B order')
  eq(pi(p),[['UKFC UNCS','jUnC'],['The 5 Great Kage','Ring Reapers']],'play-in as it stands')
  eq(p.byeTeam,null,'Spring-champ bye is moot while MUDS is top 2')
  eq(p.status['Champions United'],'in','conference leader is in')
  eq(p.status['jUnC'],'playin','bottom of the conference plays in')
}

// 2 — the branch that swings it: any UNCS win drops Sheath Elite to the play-in
{
  const br=P.branches(SUMMER,{team_a_name:'UKFC UNCS',team_b_name:'Ring Reapers'})
  const uncs=br[0], reap=br[1]
  eq(uncs.winner,'UKFC UNCS','first branch is team A winning')
  eq(pi(uncs.picture),[['Sheath Elite','jUnC'],['The 5 Great Kage','Ring Reapers']],'UNCS win → Sheath to the play-in')
  eq(uncs.picture.status['UKFC UNCS'],'in','UNCS win → UNCS through')
  eq(pi(reap.picture),[['UKFC UNCS','jUnC'],['The 5 Great Kage','Ring Reapers']],'Reapers win → seeds hold')
  eq(reap.picture.status['Sheath Elite'],'in','Reapers win → Sheath stay through')
  // every scoreline keeps Sheath out of the top 2 — the branch is the branch
  eq(uncs.margins.map(p=>p.status['Sheath Elite']),['playin','playin','playin'],'UNCS win drops Sheath at every scoreline')

  // 3 — the margin: 3-0 or 3-1 gives UNCS seed 2, 3-2 hands it to MUDS on
  // total bouts won (the worked example that forced the third tiebreak)
  eq(names(uncs.margins[0].seeds),['Champions United','UKFC UNCS','Team MUDS','Team Rag Tags'],'3-0 UNCS win → UNCS seed 2')
  eq(names(uncs.margins[2].seeds),['Champions United','Team MUDS','UKFC UNCS','Team Rag Tags'],'3-2 UNCS win → MUDS seed 2')
  eq(P.marginNote(uncs),'A 3-2 WIN PUTS TEAM MUDS ON SEED 2','margin note names the swap')
  eq(P.marginNote(reap),null,'no margin note when the scoreline changes nothing')
}

// 4 — the third tiebreak in isolation: level on wins AND on bout differential
{
  const tied=[T('Alpha','A',3,2,12,8),T('Bravo','A',3,2,11,7),T('Cee','A',1,4,4,12),T('Dee','A',0,5,2,14)]
  eq(names(P.picture(tied,null,null).confs.A),['Alpha','Bravo','Cee','Dee'],'equal record + equal diff → most bouts won')
}

// 5 — the Spring-champion bye, in the only shape where it bites: champion 3rd
{
  const s=[T('Champions United','A',4,1,12,8),T('UKFC UNCS','A',3,2,11,8),
           T('Sheath Elite','A',2,3,9,10),T('jUnC','A',1,4,4,14),
           T('The 5 Great Kage','B',4,1,13,7),T('Team Rag Tags','B',3,2,10,8),
           T('Team MUDS','B',2,3,9,10),T('Ring Reapers','B',1,4,5,13)]
  const p=P.picture(s)
  eq(p.byeTeam,'Team MUDS','champion finishing 3rd takes the bye')
  eq(p.status['Team MUDS'],'bye','champion is through without a play-in')
  eq(pi(p),[['Ring Reapers','Sheath Elite']],'one play-in: champion partner v the HIGHER of the other bottom two')
  eq(p.status['jUnC'],'out','the lower of the other bottom two is out — the field stays 6')
  eq(p.seeds.length+p.playin.length,6,'five through plus one survivor is six')
}

// 6 — bye is moot when the champion finished top 2 (the Summer case)
{
  const p=P.picture(SUMMER,null,'Champions United')
  eq(p.byeTeam,null,'top-2 champion gets no play-in bye')
  eq(pi(p).length,2,'two play-in matches when the bye does not bite')
}

// 7 — projection arithmetic
{
  const rows=P.project(SUMMER,{winner:'Ring Reapers',loser:'UKFC UNCS',winner_bouts:3,loser_bouts:1})
  const r=rows.find(t=>t.team_name==='Ring Reapers'), u=rows.find(t=>t.team_name==='UKFC UNCS')
  eq([r.match_wins,r.bouts_won,r.bout_diff],[2,9,-3],'winner gains the match and the bouts')
  eq([u.match_losses,u.bouts_lost,u.bout_diff],[3,8,1],'loser takes the loss and the bouts against')
  eq(SUMMER.find(t=>t.team_name==='Ring Reapers').match_wins,1,'projection never mutates the real standings')
}

// 8 — nothing to draw, rather than a crash on air
{
  eq(P.branches(SUMMER,null),null,'no remaining match → no branches')
  eq(P.branches(SUMMER,{team_a_name:'UKFC UNCS'}),null,'half a match → no branches')
  eq(P.picture([]).playin,[],'empty standings draw nothing')
  eq(names(P.project(SUMMER,{winner:'Ghost Team',loser:'jUnC'})).length,8,'unknown team in a sim is ignored')
}

// 9 — clinched, not "currently second": the tag has to survive tonight
{
  const left=[{team_a_name:'UKFC UNCS',team_b_name:'Ring Reapers'}]
  const o=P.outlook(SUMMER,left)
  eq(o.status['Champions United'],'in','conference winner is clinched')
  eq(o.status['Sheath Elite'],'live','A2 with a rival still to play is NOT through')
  eq(o.status['UKFC UNCS'],'live','the team playing tonight is on the line')
  eq(o.status['jUnC'],'playin','bottom of the conference is already in the play-in')
  eq(o.status['Team MUDS'],'in','a conference nobody is still playing in is settled')
  eq(o.status['Ring Reapers'],'playin','the Reapers cannot climb out of B4 tonight')
  eq(o.pending,1,'one match left')
  eq(o.decided,false,'not decided while a match is unplayed')
}
{
  const o=P.outlook(SUMMER,[])
  eq(o.status['Sheath Elite'],'in','with nothing left to play, current position IS the status')
  eq(o.decided,true,'decided when nothing is pending')
  eq(P.outlook(SUMMER,[{team_a_name:'x'}]).decided,true,'half a match is not a match')
}

// 10 — the bracket: six seats, and seeds 1-2 are not in round 1
{
  const b=P.bracket(P.picture(SUMMER))
  eq(b.seats.map(s=>s.name),
     ['Champions United','Team MUDS','Sheath Elite','Team Rag Tags',null,null],'through teams take the top seats in seeded order')
  eq(b.seats[4].from,['UKFC UNCS','jUnC'],'seat 5 is a play-in winner')
  eq(b.seats[5].from,['The 5 Great Kage','Ring Reapers'],'seat 6 is the other play-in winner')
  eq(b.wb[0].ms.map(m=>[m.a.seed,m.b.seed]),[[3,6],[4,5]],'winners round 1 is 3v6 and 4v5')
  eq(b.wb[1].ms.map(m=>m.a.seed),[1,2],'seeds 1 and 2 enter at the semis')
  eq(b.wb[1].ms.map(m=>m.b.ref),['WINNER 4/5','WINNER 3/6'],'semis take the round-1 winners crossed')
  eq(b.lb.length,4,'four losers rounds')
  eq([b.lb[1].ms[0].a.ref,b.lb[1].ms[0].b.ref],['LOSER SEMI 1','LOSER SEMI 2'],'the two semi losers play EACH OTHER — nobody rides a bye down')
  eq([b.lb[2].ms[0].a.ref,b.lb[2].ms[0].b.ref],['WINNER LB R1','WINNER LB R2'],'both LB survivors reach the semi having won one elimination match')
  eq(b.lb[3].ms[0].b.ref,'LOSER WB FINAL','the losers final is where the WB final loser lands')
  eq(b.gf.ms[0].b.ref,'LOSERS BRACKET','grand final is the two brackets')
}
{
  // with the Spring-champ bye biting there are five through and ONE play-in,
  // so the bye team is a seat, not a seventh team
  const s=[T('Champions United','A',4,1,12,8),T('UKFC UNCS','A',3,2,11,8),
           T('Sheath Elite','A',2,3,9,10),T('jUnC','A',1,4,4,14),
           T('The 5 Great Kage','B',4,1,13,7),T('Team Rag Tags','B',3,2,10,8),
           T('Team MUDS','B',2,3,9,10),T('Ring Reapers','B',1,4,5,13)]
  const b=P.bracket(P.picture(s))
  eq(b.seats.length,6,'still six seats with the bye')
  eq(b.seats.filter(x=>x.name).length,5,'five named, one play-in winner')
  eq(b.seats[5].from,['Ring Reapers','Sheath Elite'],'the single play-in fills the last seat')
}

// 11 — what the bye is worth, in matches
{
  const b=P.bracket(P.picture(SUMMER))
  const r=P.road(b)
  eq([r[1].win,r[3].win,r[5].win],[3,4,5],'undefeated: seeds 1-2 in three · 3-4 in four · a play-in team in five')
  eq([r[1].long,r[3].long,r[5].long],[5,6,7],'losing the winners semi is the long way — and seven is the most anyone can play')
}

// 12 — the playoff calendar: every match once, and never before what feeds it
{
  const b=P.bracket(P.picture(SUMMER))
  const ns=P.nights(b)
  eq(ns.map(n=>n.ms.length),[2,2,2,2,2,2],'both play-ins, then two matches every night')
  eq(ns.map(n=>n.date),
     ['2026-08-28','2026-09-04','2026-09-05','2026-09-06','2026-09-11','2026-09-12'],
     'friday-saturday, two weekends, season ending Sat Sep 12')

  // The rescheduled play-in is the reason Sep 4 has two matches and Aug 28 has
  // one: conference A never played theirs. W1 can still open that night because
  // seat 6 is conference B's winner, which Aug 28 already decided.
  eq(ns[0].ms.map(m=>m.id),['PI1','PI2'],'both play-ins were fought on the same night')
  eq(ns[1].ms.map(m=>m.id),['W1','W2'],'and the bracket opens with a whole round')

  // Nobody fights twice in one evening -- with ONE deliberate exception, and it
  // is named here rather than left as a hole in the rule. The grand final moved
  // off Sunday onto the losers final's Saturday (2026-09-06, founder's call), so
  // whoever wins the losers final walks straight into the title match an hour
  // later. That is a real cost and it is the point: the last night is one card.
  // Every OTHER night must stay clean, which is what this pins.
  eq(ns.filter(n=>n.ms.some(m=>(m.needs||[]).some(d=>n.ms.some(x=>x.id===d)))).map(n=>n.date),
     ['2026-09-12'],'the last night is the only one that feeds itself')
  eq(ns.find(n=>n.date==='2026-09-12').ms.map(m=>m.id),['LF','GF'],
     'and it runs the losers final BEFORE the grand final it feeds')

  const all=ns.reduce((a,n)=>a.concat(n.ms.map(m=>m.id)),[])
  eq(all.length,12,'two play-ins plus ten bracket matches, all scheduled')
  eq(all.length,new Set(all).size,'nothing scheduled twice')
  eq(all.filter(id=>ns.some(n=>n.ms.some(m=>m.id===id&&m.blocked))),[],'no night runs a match before the match that feeds it')

  // and the bracket really does contain exactly what the calendar claims
  const ids=[].concat(...b.wb.map(r=>r.ms.map(m=>m.id)),...b.lb.map(r=>r.ms.map(m=>m.id)),b.gf.ms.map(m=>m.id))
  eq(ids.length,10,'ten bracket matches')
  eq(ids.filter(id=>all.indexOf(id)<0),[],'every bracket match has a night')
}

// 9 — THE BOARDS TONIGHT CAN LEAVE. The bracket is drawn one scenario at a
// time, so the thing to pin is that each scenario is a board that can actually
// happen — and that no board puts one team in two places.
{
  const LAST=[{team_a_name:'UKFC UNCS', team_b_name:'Ring Reapers'}]
  const sc=P.scenarios(SUMMER, LAST)
  eq(sc.length, 3, 'three distinct boards: UNCS by any margin, UNCS 3-2, Reapers')
  eq(sc.map(x=>x.label), ['IF UKFC UNCS WIN 3-0','IF UKFC UNCS WIN 3-2','IF RING REAPERS WIN'],
     'each board says the result that produces it, and names the margin only when the margin did it')

  // A play-in seat holds two teams because a LATER match decides it. What must
  // never happen is one team appearing twice on the same board — the bug this
  // replaced, where Sheath Elite sat in seat 2 and UKFC UNCS sat in the play-in
  // on a page that claimed both.
  sc.forEach(x=>{
    const p=P.picture(x.rows)
    const on=[].concat(...P.seats(p).map(s2=>P.who(s2)))
    eq(on.length, new Set(on).size, `${x.label}: nobody is in two places`)
    eq(P.seats(p).filter(s2=>!s2.name&&!s2.from).length, 0, `${x.label}: every seat is filled or waiting on the play-in`)
  })

  // The two teams racing for the seed swap between boards, which is the whole
  // reason the screen cycles them.
  const seatOf=(x,team)=>P.seats(P.picture(x.rows)).findIndex(s2=>s2.name===team)+1
  eq(seatOf(sc[0],'UKFC UNCS'), 2, 'a 3-0 win puts UNCS on seed 2')
  eq(seatOf(sc[2],'UKFC UNCS'), 0, 'lose and UNCS is not seeded at all — they are in the play-in')
  eq(seatOf(sc[2],'Sheath Elite'), 3, 'and Sheath Elite keeps a seed')

  // Nothing left to play, nothing to cycle: one board, no caption.
  eq(P.scenarios(SUMMER, []).length, 1, 'with the season over there is one board')
  eq(P.scenarios(SUMMER, []).map(x=>x.label), [null], 'and it carries no caption')
  eq(P.scenarios(SUMMER, LAST.concat([{team_a_name:'jUnC',team_b_name:'Team MUDS'}])).length, 1,
     'two matches left is a slideshow, not a picture — it stops at one')
}

// 10 — THE PLAYOFFS AS THREE WEEKS. Seven dated nights with a round name and a
// count is a true schedule and an info dump; this is the shape that goes on the
// loading screen, so the grouping is a rule and not a layout accident.
{
  const b=P.bracket(P.picture(SUMMER)), w=P.weeks(b)
  eq(w.length, 3, 'play-in week, then two weekends of bracket')
  eq(w.map(x=>x.title), ['PLAY-IN WEEK','PLAYOFFS · WEEK 1','PLAYOFFS · WEEK 2'], 'and they are named that way')
  eq(w.map(x=>x.dates.length), [1,3,2], 'a weekend is one card — the last one is Friday and Saturday')
  eq(w.map(x=>x.ms.length), [2,6,4], 'every match on the calendar is on exactly one card')
  eq(w[2].ms.some(m=>m.id==='GF'), true, 'the last week holds the grand final')
  eq(w.map(x=>x.stake), ['TWO SURVIVE · TWO GO HOME',
                         'FIRST LOSS PUTS YOU IN THE ELIMINATION BRACKET',
                         'THE TITLE'], 'each week says what it costs, in words')

  // The one line that replaced three cycling boards.
  eq(P.swing(P.scenarios(SUMMER,[{team_a_name:'UKFC UNCS',team_b_name:'Ring Reapers'}])).sort(),
     ['Sheath Elite','UKFC UNCS'], 'tonight is choosing between exactly those two for a play-in place')
  eq(P.swing(P.scenarios(SUMMER,[])), [], 'nothing left to play, nothing to choose between')
}

// 13 — A PLAY-IN THAT HAS BEEN FOUGHT IS NOT A COIN FLIP. Ring Reapers beat
// The 5 Great Kage on Aug 28 and the bracket kept printing "WINNER 5GK / RING
// REAPERS" in seat 6 — on a poster handed to the team that won it.
{
  const p=P.picture(SUMMER, null, undefined, ['Ring Reapers'])
  const s=P.seats(p), b=P.bracket(p)
  eq(s[5].name,'Ring Reapers','the settled seat holds the team that won it')
  eq(s[4].name,null,'the play-in nobody has fought yet is still open')
  eq(s[4].from,['UKFC UNCS','jUnC'],'and still says which two it is between')
  eq(P.who(s[5]),['Ring Reapers'],'one team in the seat, not two')

  // Seat 5 is conference A's play-in, seat 6 conference B's. Numbering only the
  // OPEN seats would have handed seat 5 conference B's match.
  eq(b.wb[0].ms.find(m=>m.id==='W2').needs,['PI1'],'the open round 1 still waits on ITS play-in')
  eq(b.wb[0].ms.find(m=>m.id==='W1').needs,[],'and the settled one waits on nothing')
  eq(P.bracket(P.picture(SUMMER, null, undefined, ['Ring Reapers','UKFC UNCS']))
      .wb[0].ms.every(m=>!m.needs.length), true, 'both settled: round 1 waits on nothing at all')

  // Winning a play-in fills seat 6. It does NOT make you seed 4.
  eq(s.slice(0,4).map(x=>x.name),
     ['Champions United','Team MUDS','Sheath Elite','Team Rag Tags'],
     'the top four are still the four seeded on record')
  eq(p.status['The 5 Great Kage'],'out','and the team that lost it is out')

  const ns=P.nights(b)
  eq(ns.map(n=>n.ms.length),[2,2,2,2,2,2],'the calendar is unchanged by a result')
}


// ── a fought round stops being a placeholder ─────────────────────────────────
// The poster printed "WINNER 4/5" on the morning of a semifinal whose two teams
// had been decided the night before, because nothing after the play-in ever
// read a result. The pairing is the identifier — no bracket id is stored on a
// match row anywhere.
{
  // Both play-ins settled, so seats are 1 CU, 2 MUDS, 3 Sheath, 4 Rag Tags,
  // 5 UKFC, 6 Ring Reapers — W1 is 3 v 6, W2 is 4 v 5.
  const p=P.picture(SUMMER, null, undefined, ['Ring Reapers','UKFC UNCS'])
  const S0=P.bracket(p).wb[1].ms
  eq(S0.map(m=>m.b.ref),['WINNER 4/5','WINNER 3/6'],'with no results the semis are still placeholders')
  eq(S0.some(m=>m.b.name), false, 'and carry no team name to print')

  const R1=[{a:'Sheath Elite', b:'Ring Reapers', winner:'Sheath Elite'},
            {a:'Team Rag Tags', b:'UKFC UNCS', winner:'Team Rag Tags'}]
  const b=P.bracket(p, R1)
  const s1=b.wb[1].ms.find(m=>m.id==='S1'), s2=b.wb[1].ms.find(m=>m.id==='S2')
  eq(s1.b.name,'Team Rag Tags','the semi names the team that won round 1')
  eq(s2.b.name,'Sheath Elite','both of them')
  eq(s1.b.ref,'WINNER 4/5','and keeps the ref, so an old renderer is unchanged')
  eq(b.wb[0].ms.find(m=>m.id==='W1').won,'Sheath Elite','a fought match names its winner')
  eq(s1.won, undefined, 'a match not yet fought names nobody')

  // The losers bracket is fed by the SAME results, which is where a hand-rolled
  // resolver goes wrong: L1 is the two teams that LOST, not the two that won.
  const l1=b.lb[0].ms[0]
  eq([l1.a.name,l1.b.name],['Ring Reapers','UKFC UNCS'],'losers round 1 is the two round-1 losers')
  eq(b.lb[1].ms[0].a.name, undefined, 'losers round 2 waits on semis nobody has played')

  // Order matters: a later round can only resolve once the earlier one has.
  const b2=P.bracket(p, R1.concat([{a:'Champions United', b:'Team Rag Tags', winner:'Champions United'}]))
  eq(b2.wb[2].ms[0].a.name,'Champions United','the winners final names the semi winner it now knows')
  eq(b2.wb[2].ms[0].b.name, undefined, 'and still waits on the semi that has not been played')
  eq(b2.lb[1].ms[0].a.name,'Team Rag Tags','losers round 2 takes the semi LOSER')

  // A result between two teams that never meet in this bracket is not a match.
  eq(P.bracket(p,[{a:'Champions United', b:'Ring Reapers', winner:'Champions United'}])
      .wb[1].ms[0].b.name, undefined, 'a pairing the bracket does not contain resolves nothing')
  eq(P.bracket(p, []).wb[1].ms[0].b.name, undefined, 'an empty result list changes nothing')
  eq(P.nights(P.bracket(p,R1)).map(x=>x.ms.length),[2,2,2,2,2,2],'the calendar is unchanged by results')

  // A pairing can meet twice. The real season through Fri Sep 11: MUDS v UKFC
  // fought the winners semi and meet again in the losers final; CU v UKFC
  // fought the winners final and can meet again in the grand final. Keyed by
  // pairing alone, both Saturday matches read as already fought.
  {
    // The table as it finished, not SUMMER above (that one is a week earlier).
    const FINAL=[
      T('Champions United','A',4,1,12,8), T('UKFC UNCS','A',3,2,11,7),
      T('Sheath Elite','A',3,2,10,7),     T('jUnC','A',1,4,4,14),
      T('Team MUDS','B',3,2,12,8),        T('Team Rag Tags','B',3,2,10,8),
      T('The 5 Great Kage','B',2,3,10,11), T('Ring Reapers','B',1,4,8,14),
    ]
    const p2=P.picture(FINAL, null, undefined, ['Sheath Elite','Ring Reapers'])
    eq(P.bracket(p2).seats.map(x=>x.name),
      ['Champions United','Team MUDS','UKFC UNCS','Team Rag Tags','Sheath Elite','Ring Reapers'],
      'the fixture seats the bracket the way it was really played')
    const SEASON=[
      {a:'UKFC UNCS', b:'Ring Reapers', winner:'UKFC UNCS', match_date:'2026-09-04T22:00:00Z'},
      {a:'Team Rag Tags', b:'Sheath Elite', winner:'Team Rag Tags', match_date:'2026-09-04T23:00:00Z'},
      {a:'Champions United', b:'Team Rag Tags', winner:'Champions United', match_date:'2026-09-05T22:00:00Z'},
      {a:'Team MUDS', b:'UKFC UNCS', winner:'UKFC UNCS', match_date:'2026-09-05T23:00:00Z'},
      {a:'Ring Reapers', b:'Sheath Elite', winner:'Sheath Elite', match_date:'2026-09-06T22:00:00Z'},
      {a:'Team Rag Tags', b:'Team MUDS', winner:'Team MUDS', match_date:'2026-09-06T23:00:00Z'},
      {a:'Sheath Elite', b:'Team MUDS', winner:'Team MUDS', match_date:'2026-09-11T22:00:00Z'},
      {a:'Champions United', b:'UKFC UNCS', winner:'Champions United', match_date:'2026-09-11T23:00:00Z'},
    ]
    const flat=b=>[...b.wb, ...b.lb, ...(b.gf?[b.gf]:[])].flatMap(r=>r.ms||[r])
    const sb=P.bracket(p2, SEASON)
    const s2=flat(sb).find(m=>m.id==='S2')
    eq(s2 && s2.won, 'UKFC UNCS', 'the first meeting is the winners semi')
    const lf=flat(sb).find(m=>m.id==='LF')
    eq(lf && [lf.a.name, lf.b.name], ['Team MUDS','UKFC UNCS'], 'the losers final names the rematch')
    eq(lf && lf.won, undefined, 'and is NOT read as already fought')
    const gf=flat(sb).find(m=>m.id==='GF')
    eq(gf && gf.won, undefined, 'nor is the grand final -- nobody is champion yet')
    const lf2=flat(P.bracket(p2, SEASON.concat([{a:'UKFC UNCS', b:'Team MUDS', winner:'Team MUDS', match_date:'2026-09-12T22:00:00Z'}]))).find(m=>m.id==='LF')
    eq(lf2 && lf2.won, 'Team MUDS', 'the second meeting, once fought, is the losers final')
    const rev=flat(P.bracket(p2, [...SEASON].reverse())).find(m=>m.id==='S2')
    eq(rev && rev.won, 'UKFC UNCS', 'results handed in newest-first are still settled oldest-first')
  }

  // A match nobody has played has no loser. This is the one a null slips
  // through: the winners final has a known `a` and an unknown `b`, so a
  // `w===b` test is null===null and names `a` as the team that just lost it.
  // The losers final then prints a live, unbeaten team as beaten.
  eq(b2.lb[3].ms[0].b.name, undefined, 'the losers final waits on a winners final nobody has played')
  eq(b2.wb[2].ms[0].won, undefined, 'an unplayed winners final names no winner either')
  const b3=P.bracket(p, R1.concat([
    {a:'Champions United', b:'Team Rag Tags', winner:'Champions United'},
    {a:'Team MUDS', b:'Sheath Elite', winner:'Team MUDS'},
    {a:'Champions United', b:'Team MUDS', winner:'Team MUDS'}]))
  eq(b3.lb[3].ms[0].b.name,'Champions United','once it IS played the beaten finalist drops to the losers final')
}

// ── the TAG on the picture board knows the play-in has been played ──────────
// outlook() overrides picture()'s status wherever it is drawn, so a play-in
// result that reaches picture() and not outlook() is invisible: the board kept
// tagging a team that had lost and gone home a week earlier as "PLAY-IN".
{
  // In this table the play-ins are UKFC UNCS v jUnC and The 5 Great Kage v
  // Ring Reapers -- Sheath Elite is 2nd in A and never goes to one.
  const done=P.outlook(SUMMER, [], undefined, ['UKFC UNCS','Ring Reapers'])
  eq(done.status['The 5 Great Kage'],'out','a team that LOST its play-in is out')
  eq(done.status['jUnC'],'out','both of them')
  eq(done.status['Ring Reapers'],'playin','a team that WON one still qualified through the play-in')
  eq(done.status['Champions United'],'in','and the seeded teams are untouched')
  const open=P.outlook(SUMMER, [])
  eq(open.status['The 5 Great Kage'],'playin','with no results nothing is decided by it')
  // It only ever NARROWS: a settled play-in cannot un-clinch anybody.
  const live=P.outlook(SUMMER, [{team_a_name:'UKFC UNCS', team_b_name:'Ring Reapers'}],
                       undefined, ['UKFC UNCS','Ring Reapers'])
  eq(live.status['Champions United'],'in','a match still to play does not shake a clinched team loose')
}

console.log(`\n${n-bad}/${n} passed${bad?` — ${bad} FAILED`:''}\n`)
process.exit(bad?1:0)
