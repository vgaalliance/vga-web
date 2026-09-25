# Cloud run — 2026-09-25 work order (vga-web: the app)

**You are a cloud session working alone while Castle is away.** Castle reviews everything when he is back.
**This repo deploys the moment `main` changes (GitHub Pages) — so you never touch `main`.**

## Rules — read before anything
1. The system's rules live in the OTHER repo (`vga-systems`): its `CLAUDE.md`, `ROADMAP.md` and `docs/audit.md`
   (F98 is this app's audit). Read the parts named below; follow the style of the code around you.
2. **One branch per item**, `cloud/<n>-<short-name>`, from `main`. **Never commit to `main`, never merge.** Push the
   branch and open **one draft PR per item**.
3. **No keys, no live anything.** The app's publishable key is in the code and is fine to read with; never write to
   the database, never change Supabase settings. A needed view/column/function goes into the PR under
   **"Needs Castle (live step)"** as SQL, and nothing in the app may depend on it until then (degrade gracefully).
4. **Every app change bumps the service-worker cache** (`bump-sw.sh`) — an installed app otherwise keeps the old shell.
5. **After every item:** `node studio/test-playoff.js`, `node --check` on any standalone `.js`, and load the app from a
   local static server (e.g. `python3 -m http.server`) in a headless browser if one is available: no console errors,
   signed out. Write down what you could and could not verify.
6. Stop an item (don't guess) if it needs a design decision not written here — note it in the PR and move on.

## The items
### 1 · Works offline, slice 3  *(build)*
Buttons that need the network — **bet, buy, rip (open a pack)** — say **"Needs a connection"** (disabled or a clear
toast) while offline, instead of firing and failing. Use the app's existing online/offline signal. Roadmap: App →
"Works offline, slice 3".

### 2 · PWA audit, batch D  *(build, carefully — it touches sign-in)*
From `vga-systems/docs/audit.md` F98, the batch-D items: **sheet races, two-tab sign-out, sign-out leftovers,
failed-read-as-empty**. Each fix small and separate commits. The rule for failed-read-as-empty: a failed read must
say it failed, never render as "you have nothing". Mark the PR **"test on a phone before merge"**.

### 3 · Feels like an app — first slice  *(build)*
From the roadmap line "Feels like an app, not a page", only these three: **touch feedback** on everything tappable,
**no layout shift** as data lands (reserve space / skeletons), and **every failure says something** (no silent empty
states). Nothing else from that line in this run.

### 4 · Staff home in the app — plan only  *(write, don't build)*
`docs/cloud-run/staff-home-plan.md`: the screens for crew (My jobs, Open jobs with ✋ I want it, my rung + the ladder,
my pay, my department's 📘 playbook) and for leads (the jobs board, Assign, applications). Base it on
`vga-systems/docs/staff-system-plan.md` §5 and the Discord dashboards that exist now (`bot/src/lib/desk-core.js`).
List every read it needs as a proposed `my_*` view / `app_*` function in SQL (identity from `app_me()`, never a
caller-supplied id — the F98 rule). Wireframe each screen in plain text. No code.

### 5 · Photo weight, fix 2 — script only  *(write, don't run)*
The roadmap line "Photo weight, fix 2": news photos, collectible card art and the fighter page hero load full size.
Write the backfill script (an ~800px WebP per image, next to the existing thumbnail pattern) and the app change that
prefers the small version when it exists and falls back when it doesn't. The script is run later by Castle with keys;
the app change must work with or without it.

## The final pass
1. Stack every `cloud/*` branch in a scratch merge (never pushed), bump the SW once, run the checks from rule 5.
2. Re-read every diff for: a write path from the app, a caller-supplied identity, an unguarded failure shown as empty,
   a missing SW bump.
3. Write **`docs/cloud-run/REVIEW.md`** on branch `cloud/review` (draft PR): per item — what changed, PR link, what was
   verified and what wasn't, "Needs Castle (live step)", open questions, and **merge / merge after phone test /
   rework / skip**. Under 12 lines each.
