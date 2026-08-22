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
  eq(ns.map(n=>n.ms.length),[2,3,2,3,2],'play-in night, then five matches a week over two weekends')
  eq(ns.map(n=>n.date),['2026-08-28','2026-09-04','2026-09-05','2026-09-11','2026-09-12'],'fridays and saturdays, season ending Sep 12')

  const all=ns.reduce((a,n)=>a.concat(n.ms.map(m=>m.id)),[])
  eq(all.length,12,'two play-ins plus ten bracket matches, all scheduled')
  eq(all.length,new Set(all).size,'nothing scheduled twice')
  eq(all.filter(id=>ns.some(n=>n.ms.some(m=>m.id===id&&m.blocked))),[],'no night runs a match before the match that feeds it')

  // and the bracket really does contain exactly what the calendar claims
  const ids=[].concat(...b.wb.map(r=>r.ms.map(m=>m.id)),...b.lb.map(r=>r.ms.map(m=>m.id)),b.gf.ms.map(m=>m.id))
  eq(ids.length,10,'ten bracket matches')
  eq(ids.filter(id=>all.indexOf(id)<0),[],'every bracket match has a night')
}

// 9 — WHO COULD BE IN THE SLOT. The bracket is read by an audience, not by
// somebody holding six seeds in their head, so every slot that can name its
// candidates has to carry them — and has to stop naming them once the pool is
// the whole field.
{
  const p=P.picture(SUMMER), b=P.bracket(p), s=P.seats(p)
  const find=id=>[].concat(...b.wb.map(r=>r.ms),...b.lb.map(r=>r.ms),b.gf.ms).find(m=>m.id===id)
  const poss=n=>P.who(s[n-1])

  eq(find('S1').b.of, poss(4).concat(poss(5)), 'WINNER 4/5 names whoever can win 4 v 5')
  eq(find('S2').b.of, poss(3).concat(poss(6)), 'WINNER 3/6 names whoever can win 3 v 6')
  eq(find('L1').a.of, poss(3).concat(poss(6)), 'LOSER 3/6 names the same pool as the winner does')
  eq(find('L1').b.of, poss(4).concat(poss(5)), 'LOSER 4/5 names the same pool as the winner does')

  // A play-in seat is exactly its two teams — never one of them early, which
  // would be the screen picking a winner before the match.
  const pin=s.filter(x=>!x.name&&x.from)
  eq(pin.map(x=>x.from.length), pin.map(()=>2), 'every play-in seat offers exactly two teams')
  eq(P.who(s[0]), [s[0].name], 'a settled seat is only itself')

  // Past the semis it says nothing, on purpose: by the final the pool is the
  // whole field and six names rotating in one slot is not information.
  eq(find('WF').a.of, [], 'the winners final does not try to name the field')
  eq(find('GF').a.of, [], 'the grand final does not try to name the field')
}

console.log(`\n${n-bad}/${n} passed${bad?` — ${bad} FAILED`:''}\n`)
process.exit(bad?1:0)
