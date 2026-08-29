# Fan cam clips

Drop the loop in here. The scene looks for `loop.webm` first, then `loop.mp4`,
and falls back to a lit-seat gradient if neither is there — so the scene never
renders black-and-broken while you are still shooting the clip.

- **`loop.webm`** (preferred) or **`loop.mp4`** — 1920x1080, seamless loop,
  no audio track. An empty chair with a person standing or sitting in frame.
- Any other clip in this folder is reachable as `?clip=<filename>`, so you can
  hold several and pick one per fighter from the URL.

The fighter portrait is composited ON TOP of the clip by `fan-cam.html`. Its
position is dialled in from the URL (`?x=`, `?y=`, `?scale=`, `?flip=1`)
rather than baked into the file, because where the seat sits in frame is a
property of the clip, not of the graphic.
