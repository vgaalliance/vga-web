# Studio assets

`avatar-blank.png` — the silhouette every fighter falls back to. 0 of 266
fighters currently have a photo, so this is what the tale of the tape draws
for both corners today.

`fighters/<slug>.png` — one file per fighter, named by the fighter's slug
(`natsu.png`, `killer-kam.png`). The tape looks here by convention, so adding
a photo is dropping a file in and pushing -- no database write, no admin step.
That matters at this scale: anything needing a row updated per fighter will not
get done for 266 of them.

Falls back to `avatar-blank.png` whenever the file is missing, so a partly
photographed roster still renders cleanly.
