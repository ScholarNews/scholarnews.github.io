#!/usr/bin/env python3
"""
Synchronize a public Google Sheet into static JSON consumed by the ScholarNews GitHub Pages site.

Expected Google Sheet: first tab of
https://docs.google.com/spreadsheets/d/1nB7yeMp_j1Jpdl3E0oYgRKFcaZ7Ikxx6_at6s190PZg/edit?usp=sharing

The sheet should be publicly readable:
Google Sheets -> Share -> General access -> Anyone with the link -> Viewer
or published to the web.
"""

from __future__ import annotations

import csv
import io
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SHEET_ID = "1nB7yeMp_j1Jpdl3E0oYgRKFcaZ7Ikxx6_at6s190PZg"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?usp=sharing"

ENDPOINTS = [
    f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv",
    f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv",
]

ALIASES = {
    "job_id": ["job_id", "id", "job id"],
    "title": ["title", "opportunity title", "name"],
    "source_url": ["source_url", "source url", "source"],
    "application_url": ["application_url", "application url", "apply url", "application link"],
    "opportunity_type": ["opportunity_type", "opportunity type", "type"],
    "type_display": ["type_display", "type display"],
    "job_type": ["job_type", "job type", "position type / job type"],
    "level": ["level", "academic level"],
    "discipline": ["discipline", "disciplines", "field", "field / discipline"],
    "position_type": ["position_type", "position type", "employment type", "status"],
    "work_mode": ["work_mode", "work mode", "mode"],
    "duration": ["duration", "contract duration"],
    "contract": ["contract", "contract type"],
    "coverage": ["coverage", "funding", "salary / coverage"],
    "hosting_institution": ["hosting_institution", "hosting institution", "institution", "employer"],
    "funding_organization": ["funding_organization", "funding organization", "funder"],
    "organization_type": ["organization_type", "organization type"],
    "location": ["location", "host location", "city / location"],
    "hosting_country": ["hosting_country", "hosting country", "country"],
    "country_code": ["country_code", "country code"],
    "flag_emoji": ["flag_emoji", "flag", "country flag"],
    "eligibility": ["eligibility", "eligible candidates"],
    "closing_date": ["closing_date", "closing date", "deadline", "deadline date"],
    "remaining": ["remaining", "remaining days", "days remaining"],
    "published_date": ["published_date", "published date", "date published"],
    "emails": ["emails", "email", "contact email"],
    "hook_1": ["hook_1", "hook 1"],
    "hook_2": ["hook_2", "hook 2"],
    "hook_3": ["hook_3", "hook 3"],
    "viral_keywords": ["viral_keywords", "viral keywords", "keywords"],
    "viral_hashtags": ["viral_hashtags", "viral hashtags", "hashtags"],
    "sciencecareers_logo_file": ["sciencecareers_logo_file", "sciencecareers logo file"],
    "hosting_logo_file": ["hosting_logo_file", "hosting logo file"],
    "funding_logo_file": ["funding_logo_file", "funding logo file"],
}

def norm(text: object) -> str:
    s = str(text or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s

def build_header_map(headers):
    normalized = {norm(h): h for h in headers}
    out = {}
    for canonical, aliases in ALIASES.items():
        for alias in aliases:
            key = norm(alias)
            if key in normalized:
                out[canonical] = normalized[key]
                break
    return out

def clean(v):
    return re.sub(r"\s+", " ", str(v or "").strip())

def compute_remaining(closing_date):
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", closing_date)
    if not m:
        return ""
    from datetime import date
    y, mo, d = map(int, m.groups())
    days = (date(y, mo, d) - date.today()).days
    return f"{days} Days"

def fetch_csv():
    last_error = None
    request_headers = {"User-Agent": "ScholarNews-GitHub-Sheet-Sync/1.0"}
    for url in ENDPOINTS:
        try:
            req = urllib.request.Request(url, headers=request_headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
            text = data.decode("utf-8-sig")
            stripped = text.lstrip().lower()
            if stripped.startswith("<!doctype html") or "<html" in stripped[:500]:
                raise RuntimeError(
                    "Google returned an HTML/sign-in page instead of CSV. "
                    "Make the sheet publicly readable or publish it to the web."
                )
            return text
        except Exception as exc:
            last_error = exc
    raise RuntimeError(
        f"Could not read Google Sheet. Last error: {last_error}. "
        "Required: Share -> General access -> Anyone with the link -> Viewer "
        "(or Publish to web)."
    )

def main():
    raw = fetch_csv()
    reader = csv.DictReader(io.StringIO(raw))
    headers = reader.fieldnames or []
    if not headers:
        raise RuntimeError("Google Sheet returned no header row.")
    header_map = build_header_map(headers)

    rows = []
    for raw_row in reader:
        if not any(clean(v) for v in raw_row.values()):
            continue
        row = {}
        for canonical, source_header in header_map.items():
            row[canonical] = clean(raw_row.get(source_header, ""))
        # Preserve any non-empty unmapped columns in normalized form.
        for h, value in raw_row.items():
            nk = norm(h)
            if nk and nk not in row:
                value = clean(value)
                if value:
                    row[nk] = value
        if not row.get("title") and not row.get("job_id"):
            continue
        if not row.get("remaining") and row.get("closing_date"):
            row["remaining"] = compute_remaining(row["closing_date"])
        rows.append(row)

    if not rows:
        raise RuntimeError(
            "Google Sheet was reachable but contained no usable opportunity rows."
        )

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = DATA_DIR / "google_sheet_latest.csv"
    json_path = DATA_DIR / "opportunities.json"
    meta_path = DATA_DIR / "last_sync.json"

    raw_path.write_text(raw, encoding="utf-8")
    json_path.write_text(
        json.dumps(rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    meta = {
        "status": "success",
        "source": "Google Sheets",
        "sheet_id": SHEET_ID,
        "sheet_url": SHEET_URL,
        "synced_at_utc": datetime.now(timezone.utc).isoformat(),
        "row_count": len(rows),
        "note": "The website reads data/opportunities.json, generated by GitHub Actions."
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(meta, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
