# Fan cam clips

Drop the loop in here. The scene looks for `loop.webm` first, then `loop.mp4`,
and falls back to a lit-seat gradient if neither is there — so the scene never
renders black-and-broken while you are still shooting the clip.

- **`loop.webm`** (preferred) or **`loop.mp4`** — 1920x1080, seamless loop,
  no audio track. An empty chair with a person standing or sitting in frame.
- Any other clip in this folder is reachable as `?clip=<filename>`, so you can
  hold several and pick one per fighter from the URL.

The fighter is composited ON TOP of the clip by `fan-cam.html`, close to the
lens with the clip out of focus behind. Every photo is measured when it loads
and scaled so each head lands the same size (`scale` 1.0 = a head 270px wide),
so a seat only says which clip, which side of frame (`x`, % of width), how
tight (`scale`), a lift in px (`y`) and `flip`.

## seats.json — the rotation

`seats.json` is the list of seats the deck cycles through, one entry per clip:

```json
{ "clip": "seat-1.mp4", "x": 61, "y": 0, "scale": 1.00, "flip": false }
```

The deck reads it, and each fan in the queue is given the next seat in turn —
`seat = position % seats.length` — so two fans in a row are never sitting in
the same chair and the order is reproducible rather than random. The framing
travels WITH the clip, because where the chair sits in frame is a property of
the footage, not of the graphic; a seat added here needs no edit to
`fan-cam.html`.

Without this file the deck sends no clip and the scene falls back to
`loop.webm` / `loop.mp4`, which is the single-clip behaviour it always had.
