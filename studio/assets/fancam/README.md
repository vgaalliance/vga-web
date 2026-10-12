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

## fans.json — a fan who is a video

A fighter can have a cut-out VIDEO instead of their photo. Put the clip in
`fans/` and name it here, by fighter slug:

```json
{ "boady": { "video": "fans/boady.webm", "dx": 0, "dy": 0, "ds": 1 } }
```

- **The clip must be WebM, VP9, with an alpha channel** (transparent
  background). That is the one transparent video format OBS's browser plays;
  a ProRes 4444 or HEVC-alpha export shows a black box. From a roto'd master:
  `ffmpeg -i in.mov -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 1500k -an out.webm`
- Head and shoulders at the top of frame, cropped at the waist or lower, a few
  seconds, loops. It is measured off its first frame and framed like a photo.
- `dx` (% of frame), `dy` (px up), `ds` (size) are optional and tune that one
  clip. No entry, or a clip that fails to load, falls back to the photo.
- The deck badges these fighters VIDEO on the roster wall.
