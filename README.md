# Yacht Proposal Builder

A working demo of the day-to-day tasks in shore-based yachting roles: charter assistant or coordinator, charter management assistant, brokerage or sales assistant, and yacht management assistant.

All clients, guests, crew and owners in the example data are fictional. Market figures show their source and the date they were checked, and rates are indicative.

> Work in progress. See [BUILD_STEPS.md](BUILD_STEPS.md) for what is built so far.

## Run it on your computer

The app is plain HTML, CSS and JavaScript with no build step. Browsers only load JavaScript modules from a web server, not straight from a file, so start a small local one:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in a browser.

## Run the tests

You need [Node.js](https://nodejs.org) (version 22 or later). There are no packages to install.

```bash
node --test
```

## Updating the yacht data

The yachts come from the research spreadsheet `Target Firm Charter Fleets.xlsx`. After editing it, run:

```bash
python3 tools/sheet_to_csv.py "Target Firm Charter Fleets.xlsx"
```

This rewrites `data/yachts.csv` (Fleets tab) and `data/for-sale.csv` (For sale tab). It keeps the web link behind each Source cell, which Excel's own "Save as CSV" would drop. A browser that has already opened the app keeps its own copy: use **Restore published list** on the Import and export screen to pick up the new files.

## Sources

To follow: job adverts the modules are based on, and the sources for every setting.
