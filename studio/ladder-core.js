/* ── UBA home: the ladder between two fighters — the RULES, DOM-free and DB-free ──
   The left column of the UBA home screen. For the fight that is up next it
   draws the division's ladder from the LOWER-ranked fighter up to the HIGHER
   one, with the fighters ranked in between. Tested in test-ladder.js.

   Rules encoded:
   1. The higher fighter is at the top, the lower one at the bottom. A champion
      is above every rank (shown as C). An unranked fighter is below every rank,
      so the ladder runs from the bottom of the division up.
   2. AT MOST 4 IN BETWEEN. With more, it keeps the 2 just under the top fighter
      and the 2 just over the bottom one, and says how many it left out in the
      middle. The ends are the ones that mean something: who the lower fighter
      passes first, and who the higher one would have under them.
   3. A title fight puts the BELT above the top fighter: the champion's belt
      when the champion is in the fight, VACANT when nobody holds it.
   4. A CATCHWEIGHT bout is two fighters from two divisions, so there is no
      one ladder between them. It gives each fighter their OWN short ladder:
      the fighter and the 2 rungs directly above them in their division (the
      belt counts as the rung above #1, VACANT when nobody holds it). Corner
      order is kept (a left, b right, like the face-off): neither is "above"
      the other across two divisions.
   5. It never predicts. Rankings are set by the committee, so this says who is
      between the two, never where the winner will land.
   Names match ignoring case and spaces at the ends: the card and the rankings
   are typed in different places. */
(function(root, factory){
  if(typeof module==='object' && module.exports) module.exports=factory()
  else root.LADDER=factory()
})(typeof self!=='undefined'?self:this, function(){

  const MAX_BETWEEN = 4
  const key = s => String(s==null?'':s).trim().toLowerCase()

  // rows: [{ name, rank }] the division's pro ladder. champion: who holds the
  // belt (or null). title: is this bout for the belt.
  function ladder(rows, a, b, opts){
    opts = opts || {}
    const ranked = (rows||[]).filter(r => r && r.name && Number.isFinite(+r.rank))
      .map(r => ({ name:r.name, rank:+r.rank })).sort((x,y) => x.rank-y.rank)
    const champ = opts.champion ? key(opts.champion) : null
    const place = n => {
      if(champ && key(n)===champ) return { name:n, rank:'C', at:0 }
      const r = ranked.find(x => key(x.name)===key(n))
      return r ? { name:n, rank:r.rank, at:r.rank } : { name:n, rank:null, at:Infinity }
    }
    const pa = place(a), pb = place(b)
    const [top, bottom] = pa.at <= pb.at ? [pa, pb] : [pb, pa]
    const belt = !opts.title ? null
      : top.rank==='C' ? { kind:'defend', name:top.name } : { kind:'vacant' }

    if(top.at===Infinity) return { kind:'unranked', top, bottom, belt, between:[], hidden:0 }

    // everyone ranked strictly between the two (the champion is never "between")
    const all = ranked.filter(r => r.rank > (top.rank==='C' ? 0 : top.rank) && r.rank < bottom.at
      && key(r.name)!==key(top.name) && key(r.name)!==key(bottom.name))
    let between = all, hidden = 0
    if(all.length > MAX_BETWEEN){
      hidden = all.length - MAX_BETWEEN
      between = [...all.slice(0, 2), { gap:hidden }, ...all.slice(-2)]
    }
    return { kind: all.length ? 'climb' : 'adjacent', top, bottom, belt, between, hidden }
  }

  const ABOVE = 2
  // Catchweight: where each fighter stands in their own division.
  // byWc: { weight_class: [{ name, rank }] }, champs: { weight_class: name }.
  // A champion is C in their division; a name on no ladder is unranked (NR).
  function catchweight(byWc, champs, a, b){
    const find = n => {
      for(const [wc, holder] of Object.entries(champs||{})) if(key(holder)===key(n)) return { name:n, rank:'C', at:0, wc }
      let best = null
      for(const [wc, rows] of Object.entries(byWc||{})) for(const r of rows||[])
        if(r && key(r.name)===key(n) && Number.isFinite(+r.rank) && (!best || +r.rank < best.at)) best = { name:n, rank:+r.rank, at:+r.rank, wc }
      return best || { name:n, rank:null, at:Infinity, wc:null }
    }
    // the rungs above a fighter, nearest LAST so the column reads top-down:
    // the belt, then #1, #2 … down to the fighter
    const col = f => {
      if(!f.wc || f.rank==='C') return { fighter:f, above:[] }
      const rungs = [ champs && champs[f.wc] ? { name:champs[f.wc], rank:'C' } : { vacant:true, rank:'C' } ]
        .concat((byWc[f.wc]||[]).filter(r => Number.isFinite(+r.rank) && +r.rank < f.at)
          .map(r => ({ name:r.name, rank:+r.rank })).sort((x,y) => x.rank-y.rank))
      return { fighter:f, above:rungs.slice(-ABOVE) }
    }
    return { kind:'catch', cols:[col(find(a)), col(find(b))], belt:null, between:[], hidden:0 }
  }

  return { ladder, catchweight, MAX_BETWEEN }
})
