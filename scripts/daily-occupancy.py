#!/usr/bin/env python3
"""
Récupère l'iCal Airbnb de Dar Num et génère occupancy.json
avec les jours occupés pour le mois en cours et les 2 mois suivants.
"""
import urllib.request, re, json, sys
from datetime import date, timedelta

ICAL_URL = 'https://www.airbnb.fr/calendar/ical/734016384586290594.ics?t=f0132a0b8db74ee79f67e93aa267d1f0'
OUT_FILE = 'occupancy.json'

def fetch_ical(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read().decode('utf-8', errors='ignore')

def parse_occupied_days(text):
    today = date.today()
    months = {}
    for offset in range(3):
        m = (today.month - 1 + offset) % 12 + 1
        y = today.year + (today.month - 1 + offset) // 12
        months[f'{y}-{m:02d}'] = set()

    for block in text.split('BEGIN:VEVENT')[1:]:
        sm = re.search(r'DTSTART[^:]*:(\d{8})', block)
        em = re.search(r'DTEND[^:]*:(\d{8})', block)
        nm = re.search(r'SUMMARY:(.*)', block)
        if not sm or not em:
            continue
        summary = (nm.group(1) if nm else '').strip()
        if re.search(r'not available|airbnb \(not available\)', summary, re.I):
            continue

        s = sm.group(1)
        e = em.group(1)
        start = date(int(s[:4]), int(s[4:6]), int(s[6:]))
        end   = date(int(e[:4]), int(e[4:6]), int(e[6:])) - timedelta(days=1)

        cur = start
        while cur <= end:
            ym = f'{cur.year}-{cur.month:02d}'
            if ym in months:
                months[ym].add(cur.day)
            cur += timedelta(days=1)

    return {ym: sorted(list(days)) for ym, days in months.items()}

try:
    text   = fetch_ical(ICAL_URL)
    result = parse_occupied_days(text)
    result['_updated'] = date.today().isoformat()
    with open(OUT_FILE, 'w') as f:
        json.dump(result, f, separators=(',', ':'))
    print(f"OK — {json.dumps(result)}")
except Exception as e:
    print(f"ERREUR: {e}", file=sys.stderr)
    sys.exit(1)
