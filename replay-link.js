// The connection between the replay player (on the streaming PC) and the
// analyst (anywhere). Supabase is only the introduction: the two pages swap a
// few small messages on a broadcast channel named after the room code, then
// talk directly over WebRTC and Supabase carries nothing else.
//
// The relay. A direct WebRTC link shows each side the other's IP address. The
// bot hands out short-lived Cloudflare TURN passes (GET /replay/ice), and with
// one the player connects ONLY through the relay, so the analyst never sees the
// streaming PC's address. Without one the player refuses to connect unless the
// operator has ticked "allow direct".
(function(){
  const SUPABASE_URL = "https://emzlivoykbhhjcugupit.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_pqhH974E1q9YsFnrVH1UJQ_X3V-rRLF";
  const BOT = "https://vga-system-production.up.railway.app";
  const STUN = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];

  // Returns { iceServers, relay:true } or { iceServers:STUN, relay:false }.
  async function ice(){
    try {
      const r = await fetch(BOT + "/replay/ice", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      // Browsers block port 53; a TURN url on it only ever times out.
      const servers = (j.iceServers || []).map(s => ({ ...s,
        urls: [].concat(s.urls).filter(u => !/:53(\?|$)/.test(u)) })).filter(s => s.urls.length);
      if (!servers.some(s => s.username)) throw new Error("no relay in answer");
      return { iceServers: servers, relay: true };
    } catch (e) {
      console.warn("relay unavailable:", e.message || e);
      return { iceServers: STUN, relay: false };
    }
  }

  function loadSupabase(){
    if (window.supabase) return Promise.resolve();
    return new Promise((ok, no) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
      s.onload = ok; s.onerror = no; document.head.appendChild(s);
    });
  }

  // One channel per room. onMsg gets every payload the OTHER page sends
  // (a broadcast does not echo back to its sender).
  async function signal(room, onMsg, onReady){
    await loadSupabase();
    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const ch = sb.channel("replay-rtc:" + room, { config: { broadcast: { ack: false } } });
    const send = msg => ch.send({ type: "broadcast", event: "sig", payload: msg });
    ch.on("broadcast", { event: "sig" }, p => onMsg(p.payload));
    ch.subscribe(st => { if (st === "SUBSCRIBED") onReady && onReady(send); });
    return send;
  }

  window.replayLink = { ice, signal };
})();
