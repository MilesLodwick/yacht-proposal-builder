"""
Turn the research spreadsheet into the CSV files the app loads.

    python3 tools/sheet_to_csv.py "Target Firm Charter Fleets.xlsx"

Writes:
    data/yachts.csv     from the "Fleets" tab   (charter yachts)
    data/for-sale.csv   from the "For sale" tab (boats for sale)

Why a script instead of Excel's "Save as CSV"?
Excel drops the web links behind the Source cells when it saves a CSV.
This script keeps each link in a "Source URL" column, and turns Excel's
date numbers (e.g. 46343) into dates the app reads (2026-11-17).

Uses only Python's standard library: nothing to install.
"""

import csv
import datetime
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
REL = "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"

TABS = {"Fleets": "yachts.csv", "For sale": "for-sale.csv"}


def column_index(cell_ref):
    """'C12' -> 2 (A is 0)."""
    letters = re.match(r"[A-Z]+", cell_ref).group()
    number = 0
    for letter in letters:
        number = number * 26 + ord(letter) - 64
    return number - 1


def excel_date(value):
    """Excel stores dates as days since 30 Dec 1899. 46343 -> '2026-11-17'."""
    try:
        return (datetime.date(1899, 12, 30) + datetime.timedelta(days=float(value))).isoformat()
    except ValueError:
        return value


def tidy_number(text):
    """'85.5' stays '85.5', '1150000.0' becomes '1150000'."""
    try:
        number = float(text)
    except ValueError:
        return text
    return str(int(number)) if number.is_integer() else repr(round(number, 4))


def read_tab(book, shared_strings, sheet_path):
    root = ET.fromstring(book.read(sheet_path))

    # Web links: which cell has which address.
    rels_path = sheet_path.replace("worksheets/", "worksheets/_rels/") + ".rels"
    targets = {}
    if rels_path in book.namelist():
        for rel in ET.fromstring(book.read(rels_path)).iter(REL):
            targets[rel.get("Id")] = rel.get("Target")
    links = {}
    for link in root.iter(f"{{{NS['m']}}}hyperlink"):
        links[link.get("ref")] = targets.get(link.get(f"{{{NS['r']}}}id"), "")

    rows = []
    for row in root.findall(".//m:sheetData/m:row", NS):
        cells = {}
        for cell in row.findall("m:c", NS):
            ref = cell.get("r")
            value_el = cell.find("m:v", NS)
            inline_el = cell.find("m:is", NS)
            if cell.get("t") == "s" and value_el is not None:
                value = shared_strings[int(value_el.text)]
            elif inline_el is not None:
                value = "".join(t.text or "" for t in inline_el.iter(f"{{{NS['m']}}}t"))
            elif value_el is not None:
                value = tidy_number(value_el.text)
            else:
                value = ""
            cells[column_index(ref)] = (value.strip(), links.get(ref, ""))
        if cells:
            width = max(cells) + 1
            rows.append([cells.get(i, ("", "")) for i in range(width)])
    return rows


def convert(xlsx_path, out_dir):
    book = zipfile.ZipFile(xlsx_path)

    shared_strings = []
    if "xl/sharedStrings.xml" in book.namelist():
        for si in ET.fromstring(book.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared_strings.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))

    workbook = ET.fromstring(book.read("xl/workbook.xml"))
    rel_targets = {r.get("Id"): r.get("Target") for r in ET.fromstring(book.read("xl/_rels/workbook.xml.rels")).iter(REL)}

    for sheet in workbook.find("m:sheets", NS):
        name = sheet.get("name")
        if name not in TABS:
            continue
        target = rel_targets[sheet.get(f"{{{NS['r']}}}id")].lstrip("/")
        sheet_path = target if target.startswith("xl/") else "xl/" + target
        rows = read_tab(book, shared_strings, sheet_path)

        headers = [value for value, _ in rows[0]]
        source_col = headers.index("Source")
        checked_col = headers.index("Checked")

        # Put "Source URL" straight after "Source".
        out_headers = headers[: source_col + 1] + ["Source URL"] + headers[source_col + 1 :]
        out_rows = []
        for row in rows[1:]:
            row = row + [("", "")] * (len(headers) - len(row))
            values = [value for value, _ in row]
            if not any(values):
                continue
            values[checked_col] = excel_date(values[checked_col]) if values[checked_col] else ""
            source_url = row[source_col][1]
            out_rows.append(values[: source_col + 1] + [source_url] + values[source_col + 1 :])

        out_path = Path(out_dir) / TABS[name]
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(out_headers)
            writer.writerows(out_rows)
        print(f"{name}: {len(out_rows)} rows -> {out_path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 tools/sheet_to_csv.py "Target Firm Charter Fleets.xlsx"')
    convert(sys.argv[1], Path(__file__).resolve().parent.parent / "data")
