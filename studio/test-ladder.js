/* Tests for ladder-core.js — the UBA home screen's ladder between two fighters.
   Run:  node studio/test-ladder.js
   The cases are the real UBA Tokyo card (2026-10-24) against the real ladders. */
const { ladder } = require('./ladder-core.js')

let n=0, bad=0
const eq=(got,want,what)=>{ n++
  const g=JSON.stringify(got), w=JSON.stringify(want)
  if(g!==w){ bad++; console.log(`  ✗ ${what}\n      got  ${g}\n      want ${w}`) }
}
// a 15-deep ladder, #1 … #15, with the real names where a case needs them
const div = names => Array.from({length:15}, (_,i) => ({ name: names[i+1] || 'R'+(i+1), rank:i+1 }))
const ranks = l => l.between.map(r => r.gap ? '+'+r.gap : r.rank)

// Tynado #2 v Bing Ling #4, middleweight, title fight, belt vacant
let L = ladder(div({2:'Tynado',4:'Bing Ling'}), 'Tynado', 'Bing Ling', { title:true })
eq([L.top.name, L.top.rank, L.bottom.name, L.bottom.rank], ['Tynado',2,'Bing Ling',4], 'higher on top, lower at the bottom')
eq(ranks(L), [3], 'only #3 sits between #2 and #4')
eq(L.belt, { kind:'vacant' }, 'a title fight with no champion puts VACANT on top')

// the corners never decide the order: B higher than A still goes on top
L = ladder(div({2:'Tynado',4:'Bing Ling'}), 'Bing Ling', 'Tynado')
eq(L.top.name, 'Tynado', 'the higher-ranked fighter is on top whichever corner they are in')
eq(L.belt, null, 'no title fight, no belt')

// DirtiestJordan (unranked) v Excel #2, light heavyweight: 13 between, cut to 4
L = ladder(div({2:'Excel'}), 'DirtiestJordan', 'Excel', { champion:'Killer Kam' })
eq([L.top.rank, L.bottom.rank], [2, null], 'an unranked fighter sits at the bottom')
eq(ranks(L), [3,4,'+9',14,15], 'more than 4: the 2 under the top, the 2 over the bottom, the rest counted')
eq(L.hidden, 9, 'how many were left out')
eq(L.kind, 'climb', 'a climb')

// TonyHungLow94 #10 v Tyrod (unranked): 5 between, still capped
L = ladder(div({10:'TonyHungLow94'}), 'TonyHungLow94', 'Tyrod')
eq(ranks(L), [11,12,'+1',14,15], 'five between is still cut to four')

// AngelicMessenger #11 v iron Micheal Chandler (unranked): exactly 4, none hidden
L = ladder(div({11:'AngelicMessenger'}), 'AngelicMessenger', 'iron Micheal Chandler')
eq(ranks(L), [12,13,14,15], 'exactly four are all shown')
eq(L.hidden, 0, 'nothing hidden at four')

// The Pooper #3 v Ilia #5 / Galf #6 v Boiled One #9
eq(ranks(ladder(div({3:'The Pooper',5:'Ilia'}), 'The Pooper', 'Ilia')), [4], '#3 v #5 → #4')
eq(ranks(ladder(div({6:'Galf',9:'Boiled One'}), 'Galf', 'Boiled One')), [7,8], '#6 v #9 → #7, #8')

// ranked next to each other
L = ladder(div({6:'A',7:'B'}), 'A', 'B')
eq([L.kind, L.between.length], ['adjacent', 0], 'next to each other: nobody between')

// the champion defends: C on top, the belt is theirs, ranks 1.. are between
L = ladder(div({3:'Contender'}), 'Lama', 'Contender', { champion:'Lama', title:true })
eq([L.top.rank, L.belt], ['C', { kind:'defend', name:'Lama' }], 'a champion is C, and the belt is theirs')
eq(ranks(L), [1,2], 'everyone ranked above the challenger is between')

// a champion in a non-title fight still sits above every rank
L = ladder(div({}), 'Lama', 'R5', { champion:'Lama' })
eq([L.top.rank, L.belt], ['C', null], 'a champion outranks #1 even with no belt on the line')

// both unranked: no ladder to draw
L = ladder(div({}), 'day_yes', 'Nobody')
eq([L.kind, L.between.length], ['unranked', 0], 'two unranked fighters have no ladder between them')

// names typed differently on the card and in the rankings still match
L = ladder([{ name:'Big Woo ', rank:4 }, { name:'X', rank:5 }, { name:'m4', rank:6 }], 'big woo', 'M4')
eq([L.top.rank, L.bottom.rank, ranks(L)], [4, 6, [5]], 'case and spaces do not stop a match')

// catchweight: each fighter gets their own short ladder, corners kept
const CW = require('./ladder-core.js').catchweight
const BY = { heavyweight:[{name:'R1',rank:1},{name:'R2',rank:2},{name:'Bloo',rank:3},{name:'Jester',rank:4}],
             middleweight:[{name:'Adonnis',rank:1},{name:'Tynado',rank:2}], lightweight:[{name:'Top',rank:1}] }
const CH = { heavyweight:'Boady', light_heavyweight:'Killer Kam' }
const up = c => c.above.map(r => r.vacant ? 'VACANT' : r.rank+':'+r.name)
L = CW(BY, CH, 'Jester', 'Tynado')
eq([L.kind, L.cols[0].fighter.name, L.cols[1].fighter.name], ['catch','Jester','Tynado'], 'catchweight keeps the corners: a left, b right')
eq([L.cols[0].fighter.wc, L.cols[0].fighter.rank, up(L.cols[0])], ['heavyweight', 4, ['2:R2','3:Bloo']], '#4 heavyweight: the 2 directly above')
eq([L.cols[1].fighter.wc, up(L.cols[1])], ['middleweight', ['VACANT','1:Adonnis']], '#2 middleweight: #1, then the vacant belt above them')
L = CW(BY, CH, 'Top', 'killer kam')
eq(up(L.cols[0]), ['VACANT'], '#1 with no champion: just the vacant belt above')
eq([L.cols[1].fighter.rank, L.cols[1].fighter.wc, up(L.cols[1])], ['C','light_heavyweight',[]], 'a champion has nobody above')
L = CW(BY, CH, 'Nobody', 'R1')
eq([L.cols[0].fighter.rank, up(L.cols[0])], [null, []], 'an unranked fighter has no ladder to show')
eq(up(L.cols[1]), ['C:Boady'], '#1 heavyweight: the champion above')

// an empty or broken ladder never throws
eq(ladder(null, 'A', 'B').kind, 'unranked', 'no ladder at all is two unranked fighters, never a crash')

console.log(bad ? `\n${bad} of ${n} FAILED` : `ladder: ${n} assertions passed`)
process.exit(bad ? 1 : 0)
