/* ── UBAe playoff picture — the RULES, DOM-free and DB-free ──────────────
   The seeding rules are the one part of UBAe that is decided by argument, not
   by a scoreboard, so they live here where they can be tested rather than
   inside the standby renderer where they can only be eyeballed on air.

   Source of truth for every rule below: docs/ubae-plan.md, "Playoffs — 6-team
   double elimination" (VGA Systems repo). If a rule changes there, change it
   here and add a case to test-playoff.js.

   Rules encoded:
   1. Seed / place by MATCH WINS, then BOUT DIFFERENTIAL, then TOTAL BOUTS WON.
      There is deliberately NO head-to-head tiebreak — teams do not all play
      each other, so a head-to-head rule can answer "they never met", and the
      pair it had to separate (MUDS / UKFC UNCS) is exactly that pair.
   2. Top 2 of each conference are IN. 3rd and 4th play a play-in.
   3. The Spring-champion bye skips the PLAY-IN, and only bites if the champion
      finishes 3rd or 4th. When it bites the field STAYS SIX: the champion's
      conference partner still plays a real play-in match, against the HIGHER
      of the other conference's bottom two, and the lower one is out.
   4. Seeds 1 and 2 sit out winners-bracket round 1. That is a DIFFERENT bye
      from rule 3 and the two get confused constantly.

   The seed list this returns is the teams already through — it is provisional
   until the play-in survivors are known, because a survivor is seeded on the
   same record and can out-seed a team that never went to the play-in. */
(function(root, factory){
  if(typeof module==='object' && module.exports) module.exports=factory()
  else root.PLAYOFF=factory()
})(typeof self!=='undefined'?self:this, function(){

  // Spring Split champion — takes the play-in bye (rule 3). Not in the DB:
  // Spring is a legacy archive with no standings in this project, so the one
  // fact we need from it is named here rather than guessed from an empty view.
  const SPRING_CHAMP='Team MUDS'

  const cmp=(a,b)=>(b.match_wins-a.match_wins)||(b.bout_diff-a.bout_diff)||(b.bouts_won-a.bouts_won)

  // A hypothetical result applied to a copy of the standings. Standings are a
  // VIEW over completed matches, so "what if" can only ever be arithmetic here.
  function project(standings, sim){
    const rows=standings.map(t=>Object.assign({},t))
    if(!sim) return rows
    const w=rows.find(t=>t.team_name===sim.winner), l=rows.find(t=>t.team_name===sim.loser)
    if(!w||!l) return rows
    const ws=sim.winner_bouts==null?3:sim.winner_bouts, ls=sim.loser_bouts||0
    w.match_wins++; l.match_losses++
    w.bouts_won+=ws; w.bouts_lost+=ls; w.bout_diff=w.bouts_won-w.bouts_lost
    l.bouts_won+=ls; l.bouts_lost+=ws; l.bout_diff=l.bouts_won-l.bouts_lost
    return rows
  }

  // status per team: 'in' (through) · 'bye' (through on the Spring-champ bye) ·
  // 'playin' (has to win one) · 'out' (only reachable via rule 3)
  function picture(standings, sim, springChamp){
    const champ = springChamp===undefined ? SPRING_CHAMP : springChamp
    const rows=project(standings, sim)
    const confs={}
    rows.forEach(t=>{ (confs[t.conference]=confs[t.conference]||[]).push(t) })
    const order=Object.keys(confs).sort()
    order.forEach(k=>confs[k].sort(cmp))

    const status={}
    order.forEach(k=>confs[k].forEach((t,i)=>{ status[t.team_name]= i<2 ? 'in' : 'playin' }))

    let playin=[], byeTeam=null
    const champRow=champ && rows.find(t=>t.team_name===champ)
    const champConf=champRow && champRow.conference
    const bites=!!champRow && confs[champConf].indexOf(champRow)>1

    if(bites){
      byeTeam=champRow.team_name
      status[byeTeam]='bye'
      const partner=confs[champConf].slice(2).filter(t=>t.team_name!==byeTeam)[0]
      const otherConf=order.find(k=>k!==champConf)
      const bottom=otherConf ? confs[otherConf].slice(2) : []
      if(partner && bottom[0]) playin=[[partner, bottom[0]]]
      // the field stays 6 — the lower of the other conference's bottom two is
      // out, it does NOT expand the bracket to 7
      if(bottom[1]) status[bottom[1].team_name]='out'
    }else{
      order.forEach(k=>{ const b=confs[k].slice(2); if(b[0]&&b[1]) playin.push([b[0],b[1]]) })
    }

    const seeds=rows.filter(t=>status[t.team_name]==='in'||status[t.team_name]==='bye').sort(cmp)
    return { confs, order, status, playin, seeds, byeTeam }
  }

  // One remaining match, two branches, each played out at all three possible
  // scorelines (3-0 / 3-1 / 3-2) — because the margin is not decoration: a 3-2
  // instead of a 3-0 is what hands seed 2 (and the round-1 bye) to someone else.
  function branches(standings, match, springChamp){
    if(!match || !match.team_a_name || !match.team_b_name) return null
    const a=match.team_a_name, b=match.team_b_name
    return [a,b].map(winner=>{
      const loser = winner===a ? b : a
      const margins=[0,1,2].map(ls=>picture(standings,{winner,loser,winner_bouts:3,loser_bouts:ls},springChamp))
      return { winner, loser, margins, picture:margins[0] }
    })
  }

  // Does the scoreline change anything? Compare the three margins; if the
  // qualification picture itself moves, say so, otherwise report a seed swap.
  function marginNote(br){
    if(!br) return null
    const statusKey=p=>Object.keys(p.status).sort().map(n=>n+':'+p.status[n]).join(',')
    const seedKey=p=>p.seeds.map(t=>t.team_name).join('|')
    const base=br.margins[0]
    for(let ls=1; ls<br.margins.length; ls++){
      const p=br.margins[ls]
      if(statusKey(p)!==statusKey(base)){
        const moved=Object.keys(p.status).find(n=>p.status[n]!==base.status[n])
        return `A 3-${ls} WIN CHANGES IT — ${moved.toUpperCase()} GOES ${p.status[moved]==='playin'?'TO THE PLAY-IN':'THROUGH'}`
      }
      if(seedKey(p)!==seedKey(base)){
        const i=p.seeds.findIndex((t,ix)=>!base.seeds[ix]||t.team_name!==base.seeds[ix].team_name)
        return `A 3-${ls} WIN PUTS ${p.seeds[i].team_name.toUpperCase()} ON SEED ${i+1}`
      }
    }
    return null
  }

  /* ── clinched, not "currently second" ──────────────────────────────────
     A green THROUGH tag is a promise. Sitting 2nd in the conference with a
     match still to play is not a promise: on the last night of the Summer
     Split, Sheath Elite were A2 and ANY UKFC UNCS win pushed them into the
     play-in without Sheath kicking a punch.

     So the tag is decided by playing out every scenario the unplayed matches
     allow — each winner, each scoreline — and keeping a status only if it
     holds in ALL of them. Anything that survives in some and not others is
     ON THE LINE, which is the honest thing to put on screen and also the more
     interesting one. */
  function outlook(standings, pending, springChamp){
    const left=(pending||[]).filter(m=>m&&m.team_a_name&&m.team_b_name)
    const base=picture(standings, null, springChamp)
    // 6 scenarios per match; past three matches the combinations stop being
    // worth computing and nothing is clinched that early anyway.
    if(!left.length || left.length>3) return { status:base.status, base, pending:left.length, decided:!left.length }

    let sims=[[]]
    left.forEach(m=>{
      const next=[]
      sims.forEach(pre=>{
        [[m.team_a_name,m.team_b_name],[m.team_b_name,m.team_a_name]].forEach(([w,l])=>{
          [0,1,2].forEach(ls=>next.push(pre.concat([{winner:w,loser:l,winner_bouts:3,loser_bouts:ls}])))
        })
      })
      sims=next
    })

    const seen={}
    sims.forEach(chain=>{
      // chain the hypotheticals: each one is applied to the table the last
      // one produced, or a team playing twice would only ever bank one result
      let rows=standings
      chain.forEach(sim=>{ rows=project(rows, sim) })
      const p=picture(rows, null, springChamp)
      Object.keys(p.status).forEach(n=>{ (seen[n]=seen[n]||{})[p.status[n]]=1 })
    })
    const status={}
    Object.keys(seen).forEach(n=>{
      const k=Object.keys(seen[n])
      status[n]= k.length===1 ? k[0] : 'live'
    })
    return { status, base, pending:left.length, decided:false }
  }

  /* ── the bracket ───────────────────────────────────────────────────────
     6 teams, double elimination, seeds 1 and 2 sitting out winners round 1,
     and a TRUE grand final (the winners-bracket team only has to lose once —
     there is no reset). docs/ubae-plan.md locks those three facts; the seat
     and pairing rules below are the standard 6-team shape they imply:

       WINNERS  R1  3 v 6 · 4 v 5          (1 and 2 are already in the semis)
                SF  1 v W(4/5) · 2 v W(3/6)
                F   W(SF1) v W(SF2)
       LOSERS   R1  L(3/6) v L(4/5)
                R2  the two semi losers play EACH OTHER
                SF  W(LB R1) v W(LB R2)
                F   W(LB SF) v L(WB final)
       GRAND FINAL  W(WB final) v W(LB final) — one loss and it is over

     The one place a 6-team bracket has a free choice is what happens to the
     two winners-semi losers, since the losers bracket can only take one of
     them at that point. **They play each other** (founder, 2026-08-22), which
     is the balanced answer: nobody rides a bye down, and both LB survivors
     reach the losers semi having won exactly one elimination match. */

  // Seats 1..6. Teams already through take the top seats in seeded order and
  // the play-in winners take what is left — which seats those are is not
  // cosmetic, because seats 1 and 2 skip a round.
  function seats(p){
    const out=[]
    ;(p.seeds||[]).forEach(t=>out.push({seed:out.length+1, name:t.team_name, team:t, from:null}))
    ;(p.playin||[]).forEach(m=>out.push({seed:out.length+1, name:null, from:[m[0].team_name,m[1].team_name]}))
    while(out.length<6) out.push({seed:out.length+1, name:null, from:null})
    return out.slice(0,6)
  }

  function bracket(p){
    const s=seats(p), at=n=>s[n-1], ref=t=>({ref:t})
    return {
      seats:s,
      playin:(p.playin||[]).map(m=>({a:{name:m[0].team_name}, b:{name:m[1].team_name}})),
      wb:[
        { round:'WINNERS · ROUND 1', ms:[{a:at(3),b:at(6)},{a:at(4),b:at(5)}] },
        { round:'WINNERS · SEMIS',   ms:[{a:at(1),b:ref('WINNER 4/5')},{a:at(2),b:ref('WINNER 3/6')}] },
        { round:'WINNERS · FINAL',   ms:[{a:ref('WINNER SEMI 1'),b:ref('WINNER SEMI 2')}] },
      ],
      lb:[
        { round:'LOSERS · ROUND 1', ms:[{a:ref('LOSER 3/6'),b:ref('LOSER 4/5')}] },
        { round:'LOSERS · ROUND 2', ms:[{a:ref('LOSER SEMI 1'),b:ref('LOSER SEMI 2')}] },
        { round:'LOSERS · SEMI',    ms:[{a:ref('WINNER LB R1'),b:ref('WINNER LB R2')}] },
        { round:'LOSERS · FINAL',   ms:[{a:ref('WINNER LB SEMI'),b:ref('LOSER WB FINAL')}] },
      ],
      gf:{ round:'GRAND FINAL', ms:[{a:ref('WINNERS BRACKET'),b:ref('LOSERS BRACKET')}] },
    }
  }

  return { SPRING_CHAMP, cmp, project, picture, branches, marginNote, outlook, seats, bracket }
})
