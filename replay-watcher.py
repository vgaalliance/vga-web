"""
VGA replay telestrator -- clip watcher.

Runs on the Windows streaming PC next to OBS. Watches a folder, waits for each
new clip to finish being written, uploads it to the `replays` bucket, and files
a row naming it with whatever match and round the show is currently on. Sweeps
clips older than an hour so storage never grows.

This window is the only thing visible during a show, so every event prints one
line and nothing here is allowed to crash the watch loop.

    py -3 -m pip install supabase
    py -3 replay-watcher.py          (or double-click start-replay-watcher.bat)
"""

# ═══════════════════════════════════════════════════════════════════════════
#  CONFIG -- everything you need to change is in this block
# ═══════════════════════════════════════════════════════════════════════════

# Leave these two blank and the script will ASK you the first time it runs, then
# remember your answers in replay-settings.txt next to this file. Fill them in
# here instead if you would rather not be asked.
WATCH_FOLDER = r""

SUPABASE_URL = "https://emzlivoykbhhjcugupit.supabase.co"

# SERVICE key, not the anon key. This uploads and deletes; the web pages don't.
# Keep it on this PC. Never paste it into the control page or commit it.
SERVICE_KEY  = ""

BUCKET       = "replays"

# Only files whose name starts with this are picked up. OBS names replay-buffer
# clips "Replay ..." by default (Settings -> Advanced -> Recording -> Replay
# Buffer Filename Prefix), while a full match recording is named after the date.
# That is what keeps a 4 GB recording of the whole show out of the bucket when
# both land in the same folder. Set to "" to take every video file.
NAME_STARTS_WITH = "Replay"

# Nothing bigger than this is uploaded, whatever it is called. A replay clip is
# a few MB; anything near a gigabyte is a full recording that slipped through.
MAX_CLIP_MB = 300

# ── tuning: the defaults are fine, change only if something misbehaves ──────

RETENTION_MINUTES = 60    # clips older than this are deleted, row and file
SWEEP_EVERY_SECS  = 300   # how often the sweep runs (5 min)
POLL_EVERY_SECS   = 2     # how often the folder is checked for new files
STABLE_CHECKS     = 3     # size must be unchanged this many polls before upload
BACKFILL_SECS     = 120   # on startup, files older than this are treated as
                          # already handled; anything newer is picked up, so a
                          # restart mid-show doesn't miss the last clip or
                          # re-upload the whole folder
UPLOAD_TRIES      = 3     # attempts per clip, each on a fresh connection
RETRY_EVERY_SECS  = 30    # a clip that failed all of those is tried again this often
RETRY_FOR_MINUTES = 10    # ...until this long after it was clipped, then given up on

# ═══════════════════════════════════════════════════════════════════════════
#  Nothing below here needs editing
# ═══════════════════════════════════════════════════════════════════════════

import os
import re
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone

try:
    from supabase import create_client
except ImportError:
    print("Missing dependency. Run:  py -3 -m pip install supabase")
    sys.exit(1)

VIDEO_TYPES = {
    ".mp4":  "video/mp4",
    ".mkv":  "video/x-matroska",
    ".mov":  "video/quicktime",
    ".avi":  "video/x-msvideo",
    ".flv":  "video/x-flv",
}


SETTINGS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "replay-settings.txt")


def load_settings():
    """Whatever the script asked for last time. Sits next to this file, on this
    PC only -- it holds the service key, so it never goes near the repo."""
    out = {}
    try:
        with open(SETTINGS_FILE, encoding="utf-8") as fh:
            for line in fh:
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.split("=", 1)
                    out[k.strip().upper()] = v.strip()
    except OSError:
        pass
    return out


def save_settings(folder, key):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as fh:
        fh.write("# Written by replay-watcher.py. Delete this file to be asked again.\n")
        fh.write("# Holds your SERVICE key -- keep it on this PC.\n")
        fh.write(f"FOLDER={folder}\n")
        fh.write(f"KEY={key}\n")


def ask_setup():
    """First run. Ask for the two things that cannot be guessed, then remember
    them, so nobody has to open this file in Notepad during a show."""
    saved = load_settings()

    folder = WATCH_FOLDER or saved.get("FOLDER", "")
    while not os.path.isdir(folder):
        if folder:
            print(f"  that folder does not exist: {folder}")
        print()
        print("  Which folder does OBS save replay clips into?")
        print(r"  Paste the path and press enter, e.g.  G:\OBS ANALYST REPLAY")
        print("  (right-click in this window to paste)")
        folder = input("  folder: ").strip().strip('"')

    key = SERVICE_KEY or saved.get("KEY", "")
    while not key.startswith(("sb_secret_", "eyJ")):
        if key:
            print("  that does not look like a service key -- it starts with sb_secret_")
        print()
        print("  Paste your Supabase SERVICE key.")
        print("  Dashboard -> Settings -> API Keys -> the secret one -> Reveal -> Copy.")
        print("  (right-click in this window to paste, then press enter)")
        key = input("  key: ").strip().strip('"')

    if (folder, key) != (saved.get("FOLDER"), saved.get("KEY")):
        save_settings(folder, key)
        print()
        print(f"  saved. next time it starts straight up -- delete {os.path.basename(SETTINGS_FILE)} to change it")
    return folder, key


class Supa:
    """The Supabase client, replaceable. A connection cut mid-upload (WinError
    10054 -- wifi dropping, a VPN reconnecting) can leave the client holding a
    dead socket that every later request reuses, so one blip fails every clip
    after it. Retrying on a FRESH client is what actually recovers."""

    def __init__(self, key):
        self.key = key
        self.c = create_client(SUPABASE_URL, key)

    def fresh(self):
        try:
            self.c = create_client(SUPABASE_URL, self.key)
        except Exception as exc:
            log("ERR", f"couldn't reconnect to Supabase: {exc}")
        return self.c


def short(exc):
    text = str(exc) or type(exc).__name__
    return text if len(text) <= 140 else text[:137] + "..."


def looks_like_network(exc):
    text = f"{type(exc).__name__} {exc}".lower()
    return any(k in text for k in ("10054", "10053", "10060", "forcibly closed", "timed out", "timeout",
                                   "connection", "getaddrinfo", "network", "reset",
                                   # a TLS record mangled in transit -- seen live on 2026-09-11 on
                                   # the same PC that was throwing 10054s. Same cause, different words.
                                   "ssl", "bad record mac", "eof occurred"))


def log(tag, message):
    """One readable line per event. Flushed, so it appears immediately."""
    print(f"{datetime.now():%H:%M:%S}  {tag:<7} {message}", flush=True)


def safe_key(filename):
    """Object name in the bucket: timestamped, so two clips a second apart in
    the same OBS session can never overwrite each other."""
    stem, ext = os.path.splitext(filename)
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-") or "clip"
    return f"{int(time.time() * 1000)}-{stem}{ext.lower()}"


def public_url(key):
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{key}"


def key_from_url(url):
    """Reverse of public_url, for the sweep. Returns None if the row's url
    doesn't point at this bucket (hand-added rows, an old project, etc.)."""
    marker = f"/storage/v1/object/public/{BUCKET}/"
    if not url or marker not in url:
        return None
    return url.split(marker, 1)[1].split("?", 1)[0]


def is_video(filename):
    if os.path.splitext(filename)[1].lower() not in VIDEO_TYPES:
        return False
    if NAME_STARTS_WITH and not filename.lower().startswith(NAME_STARTS_WITH.lower()):
        return False
    return True


def finished_writing(path, seen_sizes):
    """OBS keeps writing for a moment after the file appears, and uploading
    early gives a truncated clip. A file is ready when its size has stopped
    changing for STABLE_CHECKS polls AND it can be opened -- on Windows OBS
    holds an exclusive lock while it is still writing, so the open failing is
    the strongest signal there is."""
    try:
        size = os.path.getsize(path)
    except OSError:
        return False

    if size == 0:
        seen_sizes[path] = (0, 0)
        return False

    last_size, stable_for = seen_sizes.get(path, (None, 0))
    stable_for = stable_for + 1 if size == last_size else 0
    seen_sizes[path] = (size, stable_for)

    if stable_for < STABLE_CHECKS:
        return False

    try:
        with open(path, "rb"):
            pass
    except OSError:
        return False          # still locked by OBS; try again next poll
    return True


def read_match_round(sb):
    """What the show is on, or None if it can't be read right now."""
    try:
        res = sb.table("replay_state").select("match_no,round_no").eq("id", 1).limit(1).execute()
        if res.data:
            return int(res.data[0]["match_no"]), int(res.data[0]["round_no"])
    except Exception:
        pass
    return None


def current_match_round(sb):
    """What the show is on. If this read fails the clip still gets filed --
    a clip tagged 1/1 is recoverable, a clip that never uploaded is not."""
    tag = read_match_round(sb)
    if tag is None:
        log("ERR", "couldn't read replay_state -- filing as match 1 round 1")
        return 1, 1
    return tag


def new_job(db, path, filename):
    """Everything about a clip that must NOT change between retries. The key is
    fixed so a retry overwrites its own half-finished upload rather than leaving
    a second copy, and the match/round is read NOW, when OBS finished writing --
    a clip that only gets through three minutes later still belongs to the round
    it was clipped in, not the one the show has moved on to."""
    return {
        "path": path,
        "filename": filename,
        "key": safe_key(filename),
        "tag": read_match_round(db.c),       # None = couldn't read; resolved at filing time
        "until": time.time() + RETRY_FOR_MINUTES * 60,
        "next": 0,
    }


def handle_clip(db, job):
    """Upload, then file the row. Returns "done", "skip", or "retry"."""
    path, filename, key = job["path"], job["filename"], job["key"]
    mime = VIDEO_TYPES[os.path.splitext(filename)[1].lower()]
    try:
        size_mb = os.path.getsize(path) / 1_048_576
        with open(path, "rb") as fh:
            payload = fh.read()
    except OSError as exc:
        log("ERR", f"can't read {filename} off disk any more ({short(exc)}) -- giving up on it")
        return "skip"

    if size_mb > MAX_CLIP_MB:
        log("SKIP", f"{filename} is {size_mb:.0f} MB -- over the {MAX_CLIP_MB} MB cap, not a replay clip")
        return "skip"

    for attempt in range(1, UPLOAD_TRIES + 1):
        try:
            # upsert: the key is this clip's own, so the only thing it can ever
            # overwrite is an earlier attempt at the same clip that got cut off
            db.c.storage.from_(BUCKET).upload(
                path=key, file=payload, file_options={"content-type": mime, "upsert": "true"}
            )
            break
        except Exception as exc:
            if attempt == UPLOAD_TRIES:
                log("ERR", f"upload failed for {filename}: {short(exc)}")
                if looks_like_network(exc):
                    log("ERR", "  ^ the connection dropped -- check wifi, and turn off WARP/VPN while streaming")
                return "retry"
            wait = 2 * attempt
            log("RETRY", f"{filename}: connection dropped, trying again in {wait}s ({attempt}/{UPLOAD_TRIES})")
            time.sleep(wait)
            db.fresh()
    log("UP", f"{filename}  ({size_mb:.1f} MB)  ->  {key}")

    if job["tag"] is None:
        job["tag"] = current_match_round(db.c)
    match_no, round_no = job["tag"]
    row = {"name": filename, "url": public_url(key), "match_no": match_no, "round_no": round_no}
    for attempt in (1, 2):
        try:
            db.c.table("replay_clips").insert(row).execute()
            log("ROW", f"{filename}  ->  match {match_no}, round {round_no}")
            return "done"
        except Exception as exc:
            if attempt == 2:
                # The file is up but nothing points at it. A retry re-uploads
                # onto the same key (harmless) and tries the row again.
                log("ERR", f"uploaded {filename} but the row failed: {short(exc)}")
                return "retry"
            db.fresh()
    return "retry"


def run_pending(db, pending):
    """Second chances. A clip whose upload failed every attempt stays on this
    list and is tried again every RETRY_EVERY_SECS, so a wifi blip costs a clip
    a minute's delay instead of the clip."""
    now = time.time()
    for name, job in list(pending.items()):
        if now < job["next"]:
            continue
        if now > job["until"]:
            log("ERR", f"gave up on {name} after {RETRY_FOR_MINUTES} min -- it is still on disk")
            del pending[name]
            continue
        log("RETRY", f"{name}: trying again")
        db.fresh()
        if handle_clip(db, job) == "retry":
            job["next"] = time.time() + RETRY_EVERY_SECS
        else:
            del pending[name]


def take(db, pending, path, filename):
    """A clip OBS has finished writing: try it now, and keep it if that fails."""
    job = new_job(db, path, filename)
    if handle_clip(db, job) == "retry":
        job["next"] = time.time() + RETRY_EVERY_SECS
        pending[filename] = job
        log("WAIT", f"{filename} kept -- trying again every {RETRY_EVERY_SECS}s for {RETRY_FOR_MINUTES} min")


def sweep(sb):
    """Delete clips older than the retention window -- rows and files both."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=RETENTION_MINUTES)).isoformat()
    try:
        old = sb.table("replay_clips").select("id,name,url").lt("created_at", cutoff).execute().data or []
    except Exception as exc:
        log("ERR", f"sweep couldn't list old clips: {exc}")
        return

    if not old:
        return

    keys = [k for k in (key_from_url(row.get("url")) for row in old) if k]
    if keys:
        try:
            sb.storage.from_(BUCKET).remove(keys)
        except Exception as exc:
            # Rows are still deleted below: a row pointing at a dead file shows
            # the analyst a clip that won't play, which is worse than a file
            # nobody can reach. The bucket is swept again on the next pass.
            log("ERR", f"sweep couldn't delete {len(keys)} file(s) from the bucket: {exc}")

    try:
        sb.table("replay_clips").delete().in_("id", [row["id"] for row in old]).execute()
        log("DEL", f"swept {len(old)} clip(s) older than {RETENTION_MINUTES} min")
    except Exception as exc:
        log("ERR", f"sweep couldn't delete rows: {exc}")


def main():
    print()
    print("  VGA replay watcher")

    folder, key = ask_setup()

    print()
    print(f"  folder     {folder}")
    print(f"  picking up {(NAME_STARTS_WITH + '*') if NAME_STARTS_WITH else 'every video file'}, under {MAX_CLIP_MB} MB")
    print(f"  bucket     {BUCKET} @ {SUPABASE_URL}")
    print(f"  retention  {RETENTION_MINUTES} min, swept every {SWEEP_EVERY_SECS // 60} min")
    print("  ctrl-c to stop")
    print()

    try:
        db = Supa(key)
    except Exception as exc:
        log("ERR", f"couldn't connect to Supabase: {exc}")
        input("press enter to close")
        return

    match_no, round_no = current_match_round(db.c)
    log("READY", f"show is on match {match_no}, round {round_no}")

    handled = set()
    seen_sizes = {}
    pending = {}      # clips whose upload failed; retried by run_pending()

    # Anything already sitting in the folder from before this run is treated as
    # done, so a restart doesn't re-upload an old show. Files written in the
    # last BACKFILL_SECS are still picked up.
    now = time.time()
    skipped = 0
    for filename in os.listdir(folder):
        path = os.path.join(folder, filename)
        try:
            if is_video(filename) and now - os.path.getmtime(path) > BACKFILL_SECS:
                handled.add(filename)
                skipped += 1
        except OSError:
            pass
    if skipped:
        log("READY", f"ignoring {skipped} clip(s) already in the folder")

    last_sweep = time.time()

    while True:
        try:
            for filename in sorted(os.listdir(folder)):
                if filename in handled or not is_video(filename):
                    continue
                path = os.path.join(folder, filename)
                if not os.path.isfile(path):
                    continue

                if path not in seen_sizes:
                    log("SEEN", f"{filename}  (waiting for OBS to finish writing)")

                if finished_writing(path, seen_sizes):
                    handled.add(filename)
                    seen_sizes.pop(path, None)
                    take(db, pending, path, filename)

            run_pending(db, pending)

            if time.time() - last_sweep >= SWEEP_EVERY_SECS:
                last_sweep = time.time()
                sweep(db.c)

        except KeyboardInterrupt:
            raise
        except Exception:
            # Never stop watching. Whatever it was, print it and go round again.
            log("ERR", "unexpected error in the watch loop:")
            traceback.print_exc()

        time.sleep(POLL_EVERY_SECS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print()
        log("STOP", "watcher stopped")
