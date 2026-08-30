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
  /* `won` — the names of teams that have already WON a play-in. A seat whose
     play-in has been fought is not a coin flip any more, and drawing it as one
     is the poster telling a team that beat somebody last Friday that it might
     not be here. Left out, everything behaves as it did. */
  function picture(standings, sim, springChamp, won){
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

    // Which play-in each result settles, in the same order as `playin`. It does
    // NOT touch `status` or `seeds`: winning a play-in fills seat 5 or 6, it
    // does not make a team one of the four seeded on regular-season record, and
    // feeding it into `seeds` would hand it a top-4 seed it never earned.
    const wonSet=new Set(won||[])
    const playinWon=playin.map(m=>m.map(t=>t.team_name).find(n=>wonSet.has(n))||null)
    playin.forEach((m,i)=>{ if(playinWon[i]) m.forEach(t=>{
      if(t.team_name!==playinWon[i]) status[t.team_name]='out' }) })

    const seeds=rows.filter(t=>status[t.team_name]==='in'||status[t.team_name]==='bye').sort(cmp)
    return { confs, order, status, playin, playinWon, seeds, byeTeam }
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
    ;(p.playin||[]).forEach((m,i)=>{
      const w=(p.playinWon||[])[i]
      out.push({seed:out.length+1, name:w||null, from:[m[0].team_name,m[1].team_name],
                fromPlayin:true, team:w?(m.find(t=>t.team_name===w)||null):null})
    })
    while(out.length<6) out.push({seed:out.length+1, name:null, from:null})
    return out.slice(0,6)
  }

  function who(x){ return !x ? [] : (x.name ? [x.name] : (x.from||[])) }

  function bracket(p){
    const s=seats(p), at=n=>s[n-1], ref=t=>({ref:t})
    // Winners round 1 cannot run before the play-in — but only before the ONE
    // play-in that fills ITS seat. Seats are handed out in order, seeds first,
    // so the nth unnamed seat is the nth play-in match. Keeping this specific
    // is what lets a round-1 match share a night with the OTHER conference's
    // play-in, which is exactly the Sep 4 card: seat 6 was settled on Aug 28,
    // seat 5 is fought that evening, and only W2 waits on it.
    // Count EVERY play-in seat, settled or not — the nth play-in seat is PIn.
    // Counting only the unsettled ones renumbers them the moment one is played:
    // with seat 5 still open and seat 6 fought, seat 5 would claim PI1's slot.
    const piOf={}; let piI=0
    s.forEach(x=>{ if(x.fromPlayin){ piI++; if(!x.name) piOf[x.seed]='PI'+piI } })
    const needPI=n=>piOf[n]?[piOf[n]]:[]
    return {
      seats:s,
      playin:(p.playin||[]).map((m,i)=>({conf:m[0].conference, a:{name:m[0].team_name}, b:{name:m[1].team_name},
                                         won:(p.playinWon||[])[i]||null})),
      wb:[
        { round:'WINNERS · ROUND 1', ms:[
          {id:'W1', needs:needPI(6), a:at(3), b:at(6)},
          {id:'W2', needs:needPI(5), a:at(4), b:at(5)}] },
        { round:'WINNERS · SEMIS',   ms:[
          {id:'S1', needs:['W2'], a:at(1), b:ref('WINNER 4/5')},
          {id:'S2', needs:['W1'], a:at(2), b:ref('WINNER 3/6')}] },
        { round:'WINNERS · FINAL',   ms:[
          {id:'WF', needs:['S1','S2'], a:ref('WINNER SEMI 1'), b:ref('WINNER SEMI 2')}] },
      ],
      lb:[
        { round:'LOSERS · ROUND 1', ms:[
          {id:'L1', needs:['W1','W2'], a:ref('LOSER 3/6'), b:ref('LOSER 4/5')}] },
        { round:'LOSERS · ROUND 2', ms:[
          {id:'L2', needs:['S1','S2'], a:ref('LOSER SEMI 1'), b:ref('LOSER SEMI 2')}] },
        { round:'LOSERS · SEMI',    ms:[
          {id:'LS', needs:['L1','L2'], a:ref('WINNER LB R1'), b:ref('WINNER LB R2')}] },
        { round:'LOSERS · FINAL',   ms:[
          {id:'LF', needs:['LS','WF'], a:ref('WINNER LB SEMI'), b:ref('LOSER WB FINAL')}] },
      ],
      gf:{ round:'GRAND FINAL', ms:[
        {id:'GF', needs:['WF','LF'], a:ref('WINNERS BRACKET'), b:ref('LOSERS BRACKET')}] },
    }
  }

  /* What the seed is WORTH, in matches — both roads.

     WIN: never lose. Seeds 1 and 2 skip winners round 1, so it is semi → final
     → grand final, THREE matches for the title. Seeds 3–4 need four, a play-in
     team five.

     LONG: lose once, in the worst place to lose it — the winners SEMI. The
     losers bracket is not a straight line here (LB R1 and LB R2 both feed the
     LB semi), so dropping out of the semi costs the same four matches as
     dropping out of round 1 — LB R2 → LB semi → LB final → grand final — but
     you have already played one more to get there. So the longest road is:
     everything up to and including the semi, then those four. Which is WIN
     plus two: you trade the winners final for three losers-bracket matches.
     Seven for a play-in team, and seven is the most anyone can play. */
  function road(b){
    const out={}
    b.seats.forEach(s=>{
      const inR1=b.wb[0].ms.some(m=>(m.a&&m.a.seed)===s.seed||(m.b&&m.b.seed)===s.seed)
      let n=(inR1 ? b.wb.length : b.wb.length-1) + 1   // + the grand final
      if(!s.name && s.from) n+=1                        // + the play-in itself
      out[s.seed]={win:n, long:n+2}
    })
    return out
  }

  /* ── the playoff calendar ──────────────────────────────────────────────
     RESCHEDULED with the founder 2026-08-30: the bracket now runs FRIDAY,
     SATURDAY AND SUNDAY of two weekends — Sep 4-5-6 and Sep 11-12-13 — instead
     of Friday/Saturday only. Six bracket nights for ten bracket matches, so
     every round gets room and nobody is asked to fight twice in a night except
     once, on Sep 12.

     The play-in is SPLIT across two nights and that is not a typo. PI2
     (conference B, The 5 Great Kage v Ring Reapers) was played on Aug 28; PI1
     (conference A, Sheath Elite v jUnC) was not, so it opens Sep 4. It can
     share that night with W1 because W1 is seed 3 v seat 6 and seat 6 is the
     conference B winner — already decided. W2 is the one that waits on it, and
     it is on the Saturday.

     Ten bracket matches plus the two play-ins is twelve, and every night's
     matches stay downstream of the nights before it — which is what `nights()`
     returns and what the test checks. Dates are here rather than in the DB
     because nothing is scheduled yet: teams are unknown until each night is
     played. The graphic prefers REAL rows the moment they exist in
     team_matches.

     If the calendar moves, move it here, in docs/ubae-plan.md and in the
     ubae_playoff_nights seed in db/001_schema.sql together — the bot asks
     fighters off that table and check-code-drift.sh 18 compares the two. */
  const NIGHTS=[
    { date:'2026-08-28', label:'PLAY-IN NIGHT',          ids:['PI2'] },
    { date:'2026-09-04', label:'PLAY-IN + BRACKET OPENS', ids:['PI1','W1'] },
    { date:'2026-09-05', label:'WINNERS R1 + FIRST SEMI', ids:['W2','S2'] },
    { date:'2026-09-06', label:'SECOND SEMI + LOSERS R1', ids:['S1','L1'] },
    { date:'2026-09-11', label:'LOSERS R2 + WINNERS FINAL', ids:['L2','WF'] },
    { date:'2026-09-12', label:'ELIMINATION NIGHT',      ids:['LS','LF'] },
    { date:'2026-09-13', label:'GRAND FINAL',            ids:['GF'] },
  ]

  // The calendar with each night's matches named, and every match checked
  // against what it waits on — a night that runs a match before the match that
  // feeds it is a schedule nobody can play.
  function nights(b){
    const byId={}
    ;(b.playin||[]).forEach((m,i)=>{ byId['PI'+(i+1)]={id:'PI'+(i+1), needs:[], round:'PLAY-IN', conf:m.conf, a:m.a, b:m.b} })
    b.wb.concat(b.lb,[b.gf]).forEach(r=>r.ms.forEach(m=>{ byId[m.id]=Object.assign({round:r.round}, m) }))
    const done={}, out=[]
    NIGHTS.forEach(n=>{
      const ms=[]
      // the id order IS the running order of the night, so a match may feed
      // another one the same evening — L1 after both round 1s, GF after the
      // losers final — but never the other way round
      n.ids.forEach(id=>{
        const m=byId[id]; if(!m) return          // no play-in scheduled? skip its night
        m.blocked=(m.needs||[]).some(d=>!done[d])
        done[id]=1
        ms.push(m)
      })
      if(ms.length) out.push({date:n.date, label:n.label, ms})
    })
    return out
  }

  /* ── every way tonight can end, as WHOLE BOARDS ────────────────────────
     The bracket used to be drawn from the table AS IT STANDS, which on the last
     night is a page that cannot happen: Sheath Elite sat in seat 2 and UKFC
     UNCS sat in the play-in, both printed as though settled, when the entire
     point of the night is that only one of them can be in each of those places.
     Marking the seats amber said "this might change" without saying into what,
     and naming candidates inside each slot made it worse — the same two teams
     rotating in two slots can still show one of them in both at once.

     So the screen stops drawing one impossible board and draws the REAL ones,
     in turn: this is the bracket if UKFC win, this is the bracket if the
     Reapers win. Every frame is a board that can actually happen, which is a
     thing you can point at on a broadcast.

     Only with ONE match left. Two unplayed matches is four boards before
     margins, which is a slideshow rather than a picture — and the swing strip
     on the previous screen already says what each result does. */
  function scenarios(standings, pending, springChamp){
    const left=(pending||[]).filter(m=>m&&m.team_a_name&&m.team_b_name)
    const asIs=[{label:null, rows:standings}]
    if(left.length!==1) return asIs
    const m=left[0], byWinner={}
    ;[[m.team_a_name,m.team_b_name],[m.team_b_name,m.team_a_name]].forEach(([w,l])=>{
      // 3-0/3-1/3-2 collapse unless the margin actually moves somebody: the
      // board is the key, so "a 3-2 win puts MUDS on seed 2" appears as its own
      // scenario and an irrelevant scoreline does not.
      ;[0,1,2].forEach(ls=>{
        const rows=project(standings,{winner:w,loser:l,winner_bouts:3,loser_bouts:ls})
        const p=picture(rows,null,springChamp)
        const key=JSON.stringify([seats(p).map(x=>x.name||(x.from||[]).join('/')),
                                  (p.playin||[]).map(pr=>pr.map(t=>t.team_name))])
        const list=byWinner[w]=byWinner[w]||[]
        if(!list.some(x=>x.key===key)) list.push({key, rows, margin:`3-${ls}`})
      })
    })
    const out=[]
    Object.keys(byWinner).forEach(w=>{
      const list=byWinner[w]
      list.forEach(x=>out.push({
        // the margin is only named when it is the thing that made this board
        label:`IF ${w.toUpperCase()} WIN${list.length>1?' '+x.margin:''}`,
        rows:x.rows, key:x.key }))
    })
    return out.length>1 ? out : asIs
  }

  /* ── the playoffs as WEEKS ─────────────────────────────────────────────
     Five dated nights, each with a round name and a count, is a true schedule
     and an info dump: an audience wants to know when they need to be here and
     who is playing, and everything past that is for the broadcast to explain
     out loud. So the nights collapse into the three weeks they actually are —
     play-in, then two weekends of bracket — and each week names its matches
     only where they can be named. */
  function weeks(b){
    const ns=nights(b)
    if(!ns.length) return []
    const out=[]
    ns.forEach(n=>{
      // a weekend is one week: Friday and Saturday belong to the same card, and
      // the play-in gets its own however close it sits
      const isPI=n.ms.every(m=>m.round==='PLAY-IN')
      const last=out[out.length-1]
      const near=last && !last.isPI && !isPI &&
        (new Date(n.date+'T12:00:00Z') - new Date(last.nights[last.nights.length-1].date+'T12:00:00Z')) <= 3*864e5
      if(near) last.nights.push(n)
      else out.push({isPI, nights:[n]})
    })
    let wk=0
    return out.map(g=>{
      const ms=[].concat(...g.nights.map(n=>n.ms))
      return {
        title: g.isPI ? 'PLAY-IN WEEK' : `PLAYOFFS · WEEK ${++wk}`,
        isPI: g.isPI,
        dates: g.nights.map(n=>n.date),
        ms,
        // What this week COSTS you, in one line. The round names say what the
        // match is called; this says what it means.
        // The play-in card counts what is actually on it: conference A's play-in
        // was pushed to the Sep 4 card, so Aug 28 is one match, not two, and a
        // card that says TWO of anything is describing a night that did not
        // happen.
        stake: g.isPI ? (ms.length > 1 ? 'TWO SURVIVE · TWO GO HOME' : 'ONE SURVIVES · ONE GOES HOME')
             : ms.some(m=>m.id==='GF') ? 'THE TITLE'
             : 'FIRST LOSS PUTS YOU IN THE ELIMINATION BRACKET',
      }
    })
  }

  /* The teams tonight is choosing between, for the line under the play-in
     week: the ones that are in the play-in on SOME boards and not others. */
  function swing(scn){
    if(!scn || scn.length<2) return []
    const sets=scn.map(x=>{
      const p=picture(x.rows)
      return new Set([].concat(...(p.playin||[]).map(m=>m.map(t=>t.team_name))))
    })
    const all=new Set([].concat(...sets.map(s2=>[...s2])))
    return [...all].filter(n=>!sets.every(s2=>s2.has(n)))
  }

  return { SPRING_CHAMP, cmp, project, picture, branches, marginNote, outlook, seats, who, bracket, road, scenarios, weeks, swing, NIGHTS, nights }
})
