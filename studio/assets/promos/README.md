# Countdown promos

The countdown screen (`studio/countdown.html`) plays these full screen, one
after another, like a game's title-screen attract loop. `promos.json` is the
running order:

```json
[
  { "file": "tynado-vs-bing.mp4", "title": "UBA TOKYO", "sub": "TYNADO VS BING LING" },
  { "image": "uba15_poster_1.png", "title": "UBA 15", "sub": "THE POSTER", "secs": 9 }
]
```

- `file` — a video in this folder. It plays to the end; `secs` cuts it shorter.
- `image` — a still from `studio/assets/` (the posters live there), held for
  `secs` (default 9) with a slow push-in.
- `title` / `sub` — the menu line for it.

Every two promos the screen cuts to the standby board for 14 seconds (tonight's
card, then the Discord call to action), and those are menu lines too.

**Keep files small.** This is GitHub Pages: every file is downloaded by the
OBS browser source. Re-encode a trailer before adding it (about 3 Mbit/s 1080p
is plenty behind the menu):

```bash
ffmpeg -i "trailer.mp4" -c:v libx264 -preset slow -crf 26 -maxrate 3M -bufsize 6M -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k trailer-small.mp4
```

No `promos.json`, or every file in it fails to load: the screen falls back to
the posters in `assets/posters.json`, so it is never a black rectangle.
