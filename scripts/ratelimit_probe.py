#!/usr/bin/env python3
"""Burst a free-tier key against /api/workspaces and watch the bucket drain."""
"""Run it with STASH_API_KEY=sj_xxx python3 scripts/ratelimit_probe.py"""
import json, os, sys, time, urllib.request, urllib.error

BASE = os.environ.get("STASH_URL", "http://localhost:3000")
KEY = os.environ.get("STASH_API_KEY") or sys.exit("set STASH_API_KEY")
N = int(sys.argv[1]) if len(sys.argv) > 1 else 70   # > capacity (60) to force a 429

def hit():
    req = urllib.request.Request(f"{BASE}/api/workspaces", headers={"X-API-Key": KEY})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.headers, None
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read().decode()

for i in range(1, N + 1):
    t0 = time.perf_counter()
    status, h, body = hit()
    ms = (time.perf_counter() - t0) * 1000
    line = (f"#{i:3d} {status} {ms:6.1f}ms "
            f"limit={h.get('X-RateLimit-Limit')} "
            f"remaining={h.get('X-RateLimit-Remaining')} "
            f"reset={h.get('X-RateLimit-Reset')}")
    if status == 429:
        line += f" retry-after={h.get('Retry-After')} body={body}"
    print(line)
    if status == 429:
        wait = int(h.get("Retry-After", "1"))
        print(f"--- sleeping {wait}s, then expecting exactly 1 token back ---")
        time.sleep(wait)
        status, h, _ = hit()
        print(f"after wait: {status} remaining={h.get('X-RateLimit-Remaining')}")
        break