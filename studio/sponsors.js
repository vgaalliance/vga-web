// ── THE SPONSOR LIST — ONE COPY, LOADED BY EVERY SCENE THAT NAMES A PARTNER ──
// The tale of the tape and the countdown today. It lives in its own file
// because the alternative is the same list written twice, and two lists that
// can disagree about who tonight's sponsor is WILL disagree on the night one of
// them changes -- the countdown saying SHEATH while the tape says PROTUBEVR, on
// the same broadcast, with nobody able to fix it mid-show.
//
//   name — the wordmark
//   full — the full name, for a face that has room for it. Optional
//   url  — the site. Derived as name.com when left blank
//   code — the promo code. LEAVE IT BLANK when there is no code: nothing here
//          derives one, because a derived code is a code that does not exist
//          being read out to an audience who will type it into a checkout.
const SPONSORS = {
  sheath:    { name:'SHEATH',    full:'Sheath Underwear', url:'sheath.com',    code:'SHEATHUBA30' },
  protubevr: { name:'PROTUBEVR', full:'ProTubeVR',        url:'protubevr.com', code:'' },
}
// PROTUBEVR is the current partner, so it is what a source with no pin shows.
// This is the answer every cold OBS browser source lands on -- the live
// countdown read SHEATH.COM for exactly this reason, not because the switch
// was broken. Change this line when the partner changes; the picker is for
// switching mid-show, not for carrying the season.
const SPONSOR_DEFAULT = 'protubevr'
const sponKey = v => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g,'')

// WHO IS ON AIR, in priority order:
//   1. ?sponsor=protubevr on the browser source — locks one scene to one
//      partner with nobody clicking anything on the night.
//   2. the operator's pick, remembered in localStorage. Every studio page is
//      served from the same origin, so a pick made once in the tape's edit
//      panel is also what the countdown shows -- which is the whole point of
//      this file.
//   3. SPONSOR_DEFAULT.
// It is remembered at all because an OBS browser source reloads every time its
// scene becomes active, and a sponsor that reverts mid-show is worse than one
// that was never switched.
const SPONSOR_STORE = 'vga.sponsor'
let SPONSOR_PIN = '', SPONSOR_KEY = SPONSOR_DEFAULT
try {
  const q = sponKey(new URLSearchParams(location.search).get('sponsor'))
  const saved = sponKey(localStorage.getItem(SPONSOR_STORE))
  SPONSOR_PIN = SPONSORS[q] ? q : SPONSORS[saved] ? saved : ''
} catch (e) { SPONSOR_PIN = '' }
SPONSOR_KEY = SPONSOR_PIN || SPONSOR_DEFAULT

const activeSponsor = () => SPONSORS[SPONSOR_KEY] || SPONSORS[SPONSOR_DEFAULT]
// The address, uppercased for a broadcast. Derived from the name only as a last
// resort -- usually right, and a partner whose site is not name.com is exactly
// what the url field is for.
const sponsorSite = s => String((s && s.url) ||
  String((s && s.name) || '').toLowerCase().replace(/[^a-z0-9]/g,'') + '.com').toUpperCase()
// Returns false for a name that is not in the list, so a caller cannot pin the
// page to a partner that does not exist.
function pinSponsor(key){
  const k = sponKey(key)
  if(!SPONSORS[k]) return false
  SPONSOR_KEY = k; SPONSOR_PIN = k
  try { localStorage.setItem(SPONSOR_STORE, k) } catch (e) {}
  return true
}
