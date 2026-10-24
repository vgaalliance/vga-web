# Countdown promos

The countdown screen (`studio/countdown.html`) plays these full screen under
its game menu. They all live behind ONE menu line, **PROMOS**, however many
there are:

1. **Tonight's promo first** — the one whose `title` (or `event`) matches the
   event name the deck sends ("UBA TOKYO"). Spacing and case don't matter.
2. **Then every other one, shuffled.** Each lap is a fresh shuffle and nothing
   repeats until every promo has played.

Every two promos it cuts to a standby board (tonight's card, then the Discord
call to action) for 14 seconds.

`promos.json` is the library — order does not matter:

```json
[
  { "file": "tynado-vs-bing.mp4", "title": "UBA TOKYO", "event": "UBA TOKYO" },
  { "file": "kam-ko-edit.mp4",    "title": "KAM'S KO" },
  { "image": "uba15_poster_1.png", "title": "UBA 15", "secs": 9 }
]
```

- `file` — a video in this folder. It plays to the end; `secs` cuts it shorter.
- `image` — a still from `studio/assets/` (the posters live there), held for
  `secs` (default 9) with a slow push-in.
- `title` — what the menu shows while it plays ("NOW: KAM'S KO · 3 OF 14").
- `event` — only if the title is not the event's name: marks it as that
  night's promo.

**Keep files small.** This is GitHub Pages: every file is downloaded by the
OBS browser source. Re-encode before adding (about 3 Mbit/s 1080p — a minute
of video is roughly 15 MB). Around 30–40 promos at that size is comfortable:

```bash
ffmpeg -i "trailer.mp4" -c:v libx264 -preset slow -crf 26 -maxrate 3M -bufsize 6M -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k trailer-small.mp4
```

No `promos.json`, or every file in it fails to load: the screen falls back to
the posters in `assets/posters.json`, so it is never a black rectangle.
