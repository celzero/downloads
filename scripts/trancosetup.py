#!/usr/bin/env python3
# exec env $(cat ./.cf.credentials | xargs) ./trancosetup.py
# run from ./scripts dir; uses D1_API_TOKEN env var (mapped to CLOUDFLARE_API_TOKEN for wrangler)
#
# Downloads https://tranco-list.eu/top-1m.csv.zip, unzips the CSV
# (form: rank,domain per line), builds a local sqlite table and a
# D1-compatible .sql dump with batched INSERTs, then bulk imports
# into the `tranco` table (domain TEXT PRIMARY KEY, rank INTEGER)
# in the D1 database named `dom` via `npx wrangler d1 execute`.
#
# D1 import/export: https://developers.cloudflare.com/d1/best-practices/import-export-data/
#
# Copyright 2026 RethinkDNS and its authors
# SPDX-License-Identifier: MPL-2.0

import argparse
import csv
import os
import shutil
import sqlite3
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path
from typing import List, Optional, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent  # wrangler.toml lives here

TRANCO_URL = "https://tranco-list.eu/top-1m.csv.zip"
DB_NAME = "dom"
DB_ID = "00e16a4e-7a91-4103-88b4-5c5c396539b7"
TABLE = "tranco"

SCHEMA = f"CREATE TABLE IF NOT EXISTS {TABLE} (domain TEXT PRIMARY KEY, rank INTEGER);"


def log(*a: object):
    print(*a, flush=True)


def download_if_missing(url: str, dest: Path):
    if dest.exists() and dest.stat().st_size > 0:
        log(f"reuse: {dest} ({dest.stat().st_size} bytes)")
        return dest
    log(f"download: {url} -> {dest}")

    dest.parent.mkdir(parents=True, exist_ok=True)

    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": "trancosetup.py"})
    with urllib.request.urlopen(req) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f, length=1024 * 256)
    tmp.replace(dest)

    log(f"saved: {dest} ({dest.stat().st_size} bytes)")
    return dest


def extract_csv_from_zip(zip_path: Path, csv_path: Optional[Path] = None) -> Path:
    with zipfile.ZipFile(zip_path) as z:
        names = [n for n in z.namelist() if not n.endswith("/")]
        if not names:
            raise SystemExit(f"empty zip: {zip_path}")
        # prefer a .csv member, else first member
        pick = next((n for n in names if n.lower().endswith(".csv")), names[0])
        target = csv_path or (SCRIPT_DIR / Path(pick).name)
        if target.exists() and target.stat().st_size > 0:
            log(f"reuse csv: {target}")
            return target
        log(f"unzip: {zip_path}!{pick} -> {target}")
        with z.open(pick) as src, open(target, "wb") as dst:
            shutil.copyfileobj(src, dst, length=1024 * 256)
        return target


def parse_row(row: List[str]) -> Optional[Tuple[str, int]]:
    if not row or len(row) < 2:
        return None

    try:
        rank = int(str(row[0]).strip())
    except ValueError:
        return None

    domain = str(row[1]).strip().lower().strip(".")
    if not domain or " " in domain or rank <= 0:
        return None

    if "." not in domain:
        return None

    return (domain, rank)


def build_sqlite_and_sql(csv_path: Path, sqlite_path: Path, sql_path: Path, batch: int):
    if sqlite_path.exists():
        sqlite_path.unlink()
    con = sqlite3.connect(sqlite_path)
    cur = con.cursor()
    cur.execute(f"DROP TABLE IF EXISTS {TABLE};")
    cur.execute(f"CREATE TABLE {TABLE} (domain TEXT PRIMARY KEY, rank INTEGER);")

    total, skipped, written = 0, 0, 0
    buf: List[Tuple[str, int]] = []
    seen: set[str] = set()

    sql_path.parent.mkdir(parents=True, exist_ok=True)
    with open(sql_path, "w", encoding="utf-8", newline="\n") as out:
        # D1-compatible: no BEGIN/COMMIT; drop+recreate then batched inserts.
        out.write(f"DROP TABLE IF EXISTS {TABLE};\n")
        out.write(SCHEMA + "\n")

        def flush():
            nonlocal written
            if not buf:
                return
            cur.executemany(
                f"INSERT OR REPLACE INTO {TABLE} (domain, rank) VALUES (?, ?);",
                [(d, r) for (d, r) in buf],
            )
            vals = ",".join(
                f"('{d.replace(chr(39), chr(39)*2)}',{r})" for (d, r) in buf
            )
            out.write(f"INSERT OR REPLACE INTO {TABLE} (domain, rank) VALUES {vals};\n")
            written += len(buf)
            buf.clear()

        with open(csv_path, "r", encoding="utf-8", errors="replace", newline="") as f:
            for row in csv.reader(f):
                total += 1
                pr = parse_row(row)
                if pr is None:
                    skipped += 1
                    continue
                d, r = pr
                if d in seen:
                    skipped += 1
                    continue
                seen.add(d)
                buf.append((d, r))
                if len(buf) >= batch:
                    flush()
            flush()

    con.commit()
    n = cur.execute(f"SELECT COUNT(*) FROM {TABLE};").fetchone()[0]
    con.close()
    log(f"csv rows: {total}, skipped/dupes: {skipped}, sqlite rows: {n}, sql inserts: {written}")
    log(f"sqlite: {sqlite_path} ({sqlite_path.stat().st_size} bytes)")
    log(f"sql: {sql_path} ({sql_path.stat().st_size} bytes)")
    return n


def ensure_wrangler_token():
    # wrangler reads CLOUDFLARE_API_TOKEN; repo stores it as D1_API_TOKEN.
    if not os.getenv("CLOUDFLARE_API_TOKEN") and os.getenv("D1_API_TOKEN"):
        os.environ["CLOUDFLARE_API_TOKEN"] = os.environ["D1_API_TOKEN"]
    if not os.getenv("CLOUDFLARE_API_TOKEN"):
        log("warn: neither CLOUDFLARE_API_TOKEN nor D1_API_TOKEN is set; wrangler may prompt for login")


def wrangler_execute(db_ref: str, sql_path: Path, remote: bool, batch_size: Optional[int]):
    cmd = ["npx", "wrangler", "d1", "execute", db_ref]
    cmd += ["--remote"] if remote else ["--local"]
    cmd += [f"--file={sql_path}"]
    if batch_size:
        cmd += [f"--batch-size={batch_size}"]
    cmd += ["-y"]
    log("+", " ".join(cmd), f"(cwd={PROJECT_ROOT})")
    r = subprocess.run(cmd, cwd=PROJECT_ROOT)
    return r.returncode


def wrangler_query(db_ref: str, sql: str, remote: bool):
    cmd = ["npx", "wrangler", "d1", "execute", db_ref]
    cmd += ["--remote"] if remote else ["--local"]
    cmd += [f"--command={sql}", "--json"]
    r = subprocess.run(cmd, cwd=PROJECT_ROOT, capture_output=True, text=True)
    out = (r.stdout or "") + (r.stderr or "")
    print(out[-4000:])
    return r.returncode


def main():
    ap = argparse.ArgumentParser(description="Import tranco top-1m into D1 `tranco` table")
    ap.add_argument("--url", default=TRANCO_URL)
    ap.add_argument("--zip", default=str(SCRIPT_DIR / "top-1m.csv.zip"))
    ap.add_argument("--csv", default=str(SCRIPT_DIR / "top-1m.csv"))
    ap.add_argument("--sqlite", default=str(SCRIPT_DIR / "tranco.sqlite3"))
    ap.add_argument("--sql", default=str(SCRIPT_DIR / "tranco.sql"))
    ap.add_argument("--database", default=DB_NAME, help="D1 name for `wrangler d1 execute`")
    ap.add_argument("--database-id", default=DB_ID, help="fallback D1 id if name lookup fails")
    ap.add_argument("--batch", type=int, default=500, help="rows per INSERT statement")
    ap.add_argument("--wrangler-batch-size", type=int, default=None)
    ap.add_argument("--local", action="store_true", help="import into local D1 instead of --remote")
    ap.add_argument("--no-import", action="store_true", help="only generate sqlite+sql, skip wrangler")
    ap.add_argument("--no-download", action="store_true", help="fail if zip/csv missing instead of downloading")
    args = ap.parse_args()

    remote = not args.local
    zip_path = Path(args.zip)
    csv_path = Path(args.csv)
    sqlite_path = Path(args.sqlite)
    sql_path = Path(args.sql)

    # source: explicit --csv wins if present; else unzip cached/fresh --zip
    csv_exists = csv_path.exists() and csv_path.stat().st_size > 0
    if csv_exists and args.csv:
        log(f"reuse csv: {csv_path}")
    else:
        if args.no_download and not zip_path.exists():
            raise SystemExit(f"missing {zip_path} (and --no-download set)")
        download_if_missing(args.url, zip_path)
        csv_path = extract_csv_from_zip(zip_path, csv_path)

    build_sqlite_and_sql(csv_path, sqlite_path, sql_path, max(1, args.batch))

    if args.no_import:
        log("skip wrangler import (--no-import)")
        return 0

    ensure_wrangler_token()
    # Prefer `npx` from project root so local wrangler v3 is used.
    if not (PROJECT_ROOT / "wrangler.toml").exists():
        log(f"warn: no wrangler.toml at {PROJECT_ROOT}")

    code = wrangler_execute(args.database, sql_path, remote, args.wrangler_batch_size)
    if code != 0 and args.database_id and args.database_id != args.database:
        log(f"retry with database id {args.database_id}")
        code = wrangler_execute(args.database_id, sql_path, remote, args.wrangler_batch_size)
    if code != 0:
        raise SystemExit(f"wrangler import failed (exit {code})")

    ref = args.database
    wrangler_query(ref, f"SELECT COUNT(*) AS n FROM {TABLE};", remote)
    return 0


if __name__ == "__main__":
    sys.exit(main())
