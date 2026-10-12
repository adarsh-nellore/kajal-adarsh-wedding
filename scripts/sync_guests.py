#!/usr/bin/env python3
"""Rebuild guests.json (the RSVP name lookup) from the guest list sheet.

    python3 scripts/sync_guests.py            # download the sheet, write guests.json
    python3 scripts/sync_guests.py list.csv   # or read a CSV you exported yourself

Only names, party numbers and (if the sheet has an "Events" column) invited
events are written: guests.json is public, so emails, phones and addresses
never leave the sheet.

Sheet columns: "Group #" (party number, first column), "First Name",
"Last Name", optionally "Events" (comma-separated; e.g. "Welcome, Haldi,
Wedding, After Party", or "All"; blank means all events).
Rows without a party number are skipped (Kajal and Adarsh themselves).
"""
import csv, io, json, re, sys, urllib.request
from datetime import date
from pathlib import Path

SHEET = "1-TaY1Emb2IPlAyZFJNWPQbfAHwNS0lYSMXcNcJHpjvo"
GID = "273057248"
URL = f"https://docs.google.com/spreadsheets/d/{SHEET}/export?format=csv&gid={GID}"
OUT = Path(__file__).resolve().parent.parent / "guests.json"

EVENTS = [  # same values as the RSVP form's checkboxes
    ("welcome-party", r"welcome"),
    ("saatak-haldi", r"haldi|pooja|puja|grah|ganesh|saturday"),
    ("baarat-wedding", r"baarat|wedding|ceremony"),
    ("after-party", r"after"),
]
# a first name that's a note rather than a name ("Babli kid 1 (Adithi)", "Victor +1 (Julia)",
# "Bhavani hubby", "Plus 1") becomes an unnamed plus one; whoever replies types the name
NOTE = re.compile(r"[()+]|\b(plus|kid|kids|baby|hubby|husband|wife|daughter|son|partner|guest)\b", re.I)

# plus ones the sheet numbers apart from their host: sheet first name -> host's party.
# Harmless once the sheet itself is fixed.
PARTY_FIX = {
    "sandy +1 (linda)": "68",
    "victor +1 (julia)": "74",
    "mikey +1 (sara)": "77",
}

warnings = []


def col(header, *names):
    for i, h in enumerate(header):
        if h.strip().lower() in names:
            return i
    return None


def is_note(first, row_no):
    if NOTE.search(first):
        warnings.append(f"row {row_no}: “{first}” shown as Plus one")
        return True
    return False


def parse_events(cell, row_no):
    cell = (cell or "").strip()
    if not cell or cell.lower() in ("all", "all events"):
        return None
    out = []
    for part in re.split(r"[,;/\n]+", cell):
        part = part.strip()
        if not part:
            continue
        hit = next((v for v, rx in EVENTS if re.search(rx, part, re.I)), None)
        if hit is None:
            warnings.append(f"row {row_no}: unknown event “{part}” ignored")
        elif hit not in out:
            out.append(hit)
    return [v for v, _ in EVENTS if v in out] or None


def main():
    if len(sys.argv) > 1:
        text = Path(sys.argv[1]).read_text(encoding="utf-8-sig")
    else:
        with urllib.request.urlopen(URL, timeout=30) as r:
            text = r.read().decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    header, body = rows[0], rows[1:]
    c_party = 0
    c_first = col(header, "first name", "first", "name")
    c_last = col(header, "last name", "last", "surname")
    c_events = col(header, "events", "invited", "invited events", "invited to")
    if c_first is None:
        sys.exit("Couldn't find a 'First Name' column in the sheet.")

    guests, seen = [], {}
    for i, row in enumerate(body, start=2):
        row = row + [""] * (len(header) - len(row))
        party = row[c_party].strip()
        first = re.sub(r"\s+", " ", row[c_first]).strip()
        last = re.sub(r"\s+", " ", row[c_last]).strip() if c_last is not None else ""
        if not first and not last:
            continue
        if not party:
            warnings.append(f"row {i}: “{(first + ' ' + last).strip()}” has no party number, skipped")
            continue
        fix = PARTY_FIX.get(first.lower())
        if fix and fix != party:
            warnings.append(f"row {i}: “{first}” moved from party {party} to {fix}")
            party = fix
        events = parse_events(row[c_events], i) if c_events is not None else None
        # "Gita & Jayesh and Panda" is three people
        firsts = [p.strip() for p in re.split(r"\s*&\s*|\s+and\s+", first) if p.strip()] if not re.search(r"\(", first) else [first]
        if len(firsts) > 1:
            warnings.append(f"row {i}: split “{first}” into {', '.join(firsts)}")
        for f in firsts:
            g = {"party": party}
            if is_note(f, i):
                g["name"] = "Guest"
                g["plus"] = True
            else:
                g["name"] = f"{f} {last}".strip()
            if events:
                g["events"] = events
            key = (party, g["name"].lower())
            if not g.get("plus") and key in seen:
                warnings.append(f"row {i}: “{g['name']}” is already in party {party}, skipped")
                continue
            seen[key] = True
            guests.append(g)

    by_name = {}
    for g in guests:
        if not g.get("plus"):
            by_name.setdefault(g["name"].lower(), set()).add(g["party"])
    for name, parties in sorted(by_name.items()):
        if len(parties) > 1:
            warnings.append(f"“{name.title()}” appears in parties {', '.join(sorted(parties, key=lambda p: int(p) if p.isdigit() else 0))} (they'll pick by who they're with)")
    for p in sorted({g["party"] for g in guests}, key=lambda p: int(p) if p.isdigit() else 0):
        members = [g for g in guests if g["party"] == p]
        if all(g.get("plus") for g in members):
            warnings.append(f"party {p} has only an unnamed guest, so nobody can find it")

    lines = ",\n".join(json.dumps(g, ensure_ascii=False) for g in guests)
    OUT.write_text(f'{{"updated": "{date.today().isoformat()}", "guests": [\n{lines}\n]}}\n', encoding="utf-8")
    json.loads(OUT.read_text(encoding="utf-8"))
    print(f"Wrote {len(guests)} guests in {len({g['party'] for g in guests})} parties to {OUT.name}")
    if warnings:
        print("\nCheck these in the sheet:")
        for w in warnings:
            print(" -", w)


if __name__ == "__main__":
    main()
