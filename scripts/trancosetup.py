#!/usr/bin/env python3
# exec env $(cat ./.cf.credentials | xargs) ./trancosetup.py
# run from ./scripts dir; uses D1_API_TOKEN env var (mapped to CLOUDFLARE_API_TOKEN for wrangler)
#
# Downloads https://tranco-list.eu/top-1m.csv.zip, unzips the CSV
# (form: rank,domain per line), builds a local sqlite table and a
# D1-compatible .sql dump, then bulk imports the .sql file into the
# `tranco` table (domain TEXT PRIMARY KEY, rank INTEGER) in the D1
# database `dom` with:
#   npx wrangler d1 execute dom --remote --file=users_export.sql
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
from typing import List, Optional, Set, Tuple

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent  # wrangler.toml lives here

TRANCO_URL = "https://tranco-list.eu/top-1m.csv.zip"
DB_NAME = "dom"
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


def build_sqlite(csv_path: Path, sqlite_path: Path, flushTreshold: int = 5000) -> int:
    if sqlite_path.exists():
        sqlite_path.unlink()
    con = sqlite3.connect(sqlite_path)
    cur = con.cursor()
    cur.execute(f"DROP TABLE IF EXISTS {TABLE};")
    cur.execute(f"CREATE TABLE {TABLE} (domain TEXT PRIMARY KEY, rank INTEGER);")

    total, skipped = 0, 0
    items: List[Tuple[str, int]] = []
    seen: Set[str] = set()

    def flush():
        if not items:
            return
        cur.executemany(
            f"INSERT OR REPLACE INTO {TABLE} (domain, rank) VALUES (?, ?);",
            [(d, r) for (d, r) in items],
        )
        items.clear()

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
            items.append((d, r))
            if len(items) >= flushTreshold:
                flush()
        flush()

    con.commit()
    n = cur.execute(f"SELECT COUNT(*) FROM {TABLE};").fetchone()[0]
    con.close()
    log(f"csv rows: {total}, skipped/dupes: {skipped}, sqlite rows: {n}")
    log(f"sqlite: {sqlite_path} ({sqlite_path.stat().st_size} bytes)")
    return n


def build_sql_from_sqlite(sqlite_path: Path, sql_path: Path) -> int:
    # Export via the sqlite3 `.dump` command so the .sql file is generated
    # by sqlite itself (one INSERT per row) instead of hand-batched SQL.
    # Equivalent to: sqlite3 tranco.sqlite3 .dump > tranco.sql
    # then stripped of D1-incompatible transaction wrappers.
    sql_path.parent.mkdir(parents=True, exist_ok=True)
    sqlite3bin = shutil.which("sqlite3")
    if sqlite3bin is None:
        raise SystemExit("sqlite3 CLI not found; install it (ex: apt install sqlite3)")
    r = subprocess.run(
        [sqlite3bin, str(sqlite_path), ".dump"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise SystemExit(f"sqlite3 .dump failed (exit {r.returncode}): {r.stderr[:2000]}")
    kept: List[str] = []
    for line in r.stdout.splitlines():
        s = line.strip()
        # D1 cannot import transaction wrappers; drop them.
        if s.upper() in ("BEGIN TRANSACTION;", "BEGIN;", "COMMIT;"):
            continue
        kept.append(line)
        # Reset the remote table on import: drop before (re)create.
        if s.upper().startswith("CREATE TABLE") and TABLE.lower() in s.lower():
            kept.insert(len(kept) - 1, f"DROP TABLE IF EXISTS {TABLE};")
    written = sum(1 for ln in kept if ln.strip().upper().startswith("INSERT "))
    sql_path.write_text("\n".join(kept) + "\n", encoding="utf-8")
    log(f"sql inserts: {written}")
    log(f"sql: {sql_path} ({sql_path.stat().st_size} bytes)")
    return written


def build_sqlite_and_sql(csv_path: Path, sqlite_path: Path, sql_path: Path) -> int:
    # Build sqlite from csv, then dump it to sql via sqlite3 `.dump`.
    n = build_sqlite(csv_path, sqlite_path)
    build_sql_from_sqlite(sqlite_path, sql_path)
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
    ap.add_argument("--database", default=DB_NAME, help="D1 name or binding for `wrangler d1 execute`")
    ap.add_argument("--from-sqlite", default=None,
                    help="derive the .sql dump from this existing sqlite file (skip csv build)")
    ap.add_argument("--from-sql", default=None,
                    help="reuse this existing .sql dump directly (skip csv/sqlite build)")
    ap.add_argument("--rebuild", action="store_true",
                    help="ignore existing .sql/.sqlite files and rebuild from csv/zip")
    ap.add_argument("--wrangler-batch-size", type=int, default=10000)
    ap.add_argument("--local", action="store_true", help="import into local D1 instead of --remote")
    ap.add_argument("--no-import", action="store_true", help="only generate sqlite+.sql, skip wrangler import")
    ap.add_argument("--no-download", action="store_true", help="fail if zip/csv missing instead of downloading")
    ap.add_argument("--sqlite", default=str(SCRIPT_DIR / "tranco.sqlite3")) # out
    ap.add_argument("--sql", default=str(SCRIPT_DIR / "tranco.sql")) # out
    args = ap.parse_args()

    remote = not args.local
    zip_path = Path(args.zip)
    csv_path = Path(args.csv)
    sqlite_path = Path(args.sqlite)
    sql_path = Path(args.sql)

    def _nonempty(p: Path) -> bool:
        return p.exists() and p.stat().st_size > 0

    if args.from_sql:
        # Reuse an explicitly given .sql dump directly; skip csv/sqlite build.
        src = Path(args.from_sql)
        if not _nonempty(src):
            raise SystemExit(f"missing --from-sql file: {src}")
        log(f"from-sql: {src} ({src.stat().st_size} bytes)")
        sql_path = src
    elif not args.rebuild and _nonempty(sql_path):
        # Auto-reuse the default .sql dump if one already exists.
        log(f"reuse sql: {sql_path} ({sql_path.stat().st_size} bytes)")
    elif args.from_sqlite:
        # Derive the .sql dump from an already-built local sqlite table.
        src = Path(args.from_sqlite)
        if not _nonempty(src):
            raise SystemExit(f"missing --from-sqlite file: {src}")
        log(f"from-sqlite: {src}")
        build_sql_from_sqlite(src, sql_path)
    elif not args.rebuild and _nonempty(sqlite_path):
        # Auto-reuse the existing sqlite: dump it to .sql, skip csv build.
        log(f"reuse sqlite: {sqlite_path} ({sqlite_path.stat().st_size} bytes)")
        build_sql_from_sqlite(sqlite_path, sql_path)
    else:
        # source: explicit --csv wins if present; else unzip cached/fresh --zip
        csv_exists = csv_path.exists() and csv_path.stat().st_size > 0
        if csv_exists and args.csv:
            log(f"reuse csv: {csv_path}")
        else:
            if args.no_download and not zip_path.exists():
                raise SystemExit(f"missing {zip_path} (and --no-download set)")
            download_if_missing(args.url, zip_path)
            csv_path = extract_csv_from_zip(zip_path, csv_path)

        build_sqlite_and_sql(csv_path, sqlite_path, sql_path)

    if args.no_import:
        log("skip wrangler import (--no-import)")
        return 0

    do_wrangler_import(args, sql_path, remote)
    return 0

def do_wrangler_import(args: argparse.Namespace, sql_path: Path, remote: bool):
    ensure_wrangler_token()
    # Prefer `npx` from project root so local wrangler v3 is used.
    if not (PROJECT_ROOT / "wrangler.toml").exists():
        log(f"warn: no wrangler.toml at {PROJECT_ROOT}")

    # wrangler takes only the name or binding, not the database id.
    code = wrangler_execute(args.database, sql_path, remote, args.wrangler_batch_size)
    if code != 0:
        raise SystemExit(f"wrangler import failed (exit {code})")

    wrangler_query(args.database, f"SELECT COUNT(*) AS n FROM {TABLE};", remote)


if __name__ == "__main__":
    sys.exit(main())
