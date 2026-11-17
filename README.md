# Yacht Proposal Builder

A working demo of the day-to-day work in four shore-based yachting roles:

- charter assistant or coordinator
- charter management assistant
- brokerage or sales assistant
- yacht management assistant

I built it to show how I would handle the tasks those roles list in their job adverts: enquiries, proposals, contracts and payments, availability, owner reports, listings, deals, compliance, crew and budgets. It runs in the browser, works on a phone and needs no account.

**Live version:** the link will be added here once it is published on GitHub Pages.

## Honesty notes

- **People are fictional.** Every client, guest, crew member and owner in the example data is made up. An "Example data" banner shows while example records are present, with a button to clear them.
- **Yachts are real public listings.** Each one keeps the link to the page it came from and the date it was checked. None has been individually verified yet, so each shows a "Not yet verified" pill.
- **Rates and prices are indicative.** Charter rates are as listed by the firm. Sale prices are asking prices, not sold prices.
- **Rules of thumb are settings.** VAT rates, APA, commission, payment terms, running costs and currency rates can all be changed on the Settings screen. Each one shows where the default came from. Anything not yet confirmed says "to be checked".
- **Your data stays in your browser.** Nothing is sent anywhere. Use Import and export to save a copy as JSON or CSV.
- **AI help without an API.** The proposal screen builds a prompt to copy into Claude yourself. The site never calls an AI service and holds no keys.

## What it does

| Area | Screens |
| --- | --- |
| All roles | **Dashboard**: today's to-do list (enquiries waiting over 24 hours, options expiring, payments due, certificates expiring) and pipeline counts. |
| Charter | **Enquiries** (status pipeline, reason when lost), **Yacht selection** (filters, cost breakdown with VAT and APA, budget band, currency switch), **Itinerary** (miles, cruising time, long day flag), **Proposal** (printable top three, copy-to-Claude prompt, email template), **Contracts and payments** (checklist and payment schedule), **Preference sheet** (one-page captain handover). |
| Charter management | **Fleet records** (specs, seasonal rates, bases, flag for details over 90 days old), **Availability** (bookings, owner use, first and second options, clash and expiry warnings), **Owner report** (income, commission split, net to owner, utilisation), **Show booklet** (one page per yacht for a boat show). |
| Sales | **Listings** (status, price history, days on market), **Buyer brief** (shortlist, price per metre, running cost estimate), **Seller view** (comparables), **Viewings** and owner activity report, **Deal tracker** (MYBA MOA stages with dates and document checklists). |
| Yacht management | **Compliance** (red, amber or green by expiry date), **Crew** (certificates and expiry), **Budget vs actual** (variance and full-year forecast), **Monthly report** (one printable page). |
| Settings and data | **Settings** (every rule of thumb with its source), **Import and export** (JSON and CSV). |

## Job adverts it is based on

Each module follows duties listed in real job adverts for shore-based roles at yachting firms, including Burgess, Fraser and Northrop & Johnson. Links to the adverts are not available, so only the firm names are given.

- **Charter assistant or coordinator:** present yacht selections, create itineraries, draft MYBA contracts, handle enquiries and bookings, update the CRM.
- **Charter management assistant:** keep yacht information current on listing sites, availability calendars, APA and VAT payments, owner reports, charter shows, central agency proposals.
- **Sales assistant:** central agency listings, enquiry tracking, activity reports for owners, organising viewings, due diligence, contracts and closings.
- **Yacht management assistant:** ISM, ISPS and MLC audits, crew certification, operating budget against actual spend, monthly management reports.

## Data sources

**Charter yachts** (`data/yachts.csv`, 158 yachts) come from the public charter listings of TWW Yachts, Ocean Independence, Burgess, Edmiston, Y.CO, Northrop & Johnson, Fraser and Camper & Nicholsons, checked on 17 Nov 2026.

**Yachts for sale** (`data/for-sale.csv`, 134 boats) come from the public sales listings of Berthon and Ancasta, checked on 17 Nov 2026.

Both files are made from my research spreadsheet, `Target Firm Charter Fleets.xlsx`. Every row links to the page it came from.

**Settings defaults** (`data/settings.json`) name their sources:

| Setting | Source |
| --- | --- |
| Charter VAT by country (including two Bahamas rates, because sources disagree) | TWW Yachts and IYC VAT guides |
| APA, default 30% of the charter fee | IYC |
| Crew gratuity guide, 10% to 20% | YachtCharterFleet |
| Charter commission, 20% split 15% retail broker and 5% central agent | IYC charter management page |
| Sale deposit, 10% within 4 banking days | Breeze Yachting guide to the MYBA MOA |
| Sale commission and running costs (about 10% of value a year) | Industry rule of thumb |
| Charter payment schedule | Placeholder, to be confirmed |
| Alert timings, comparables rules, cruising speed | Working rules, editable |

Source links and dates checked for the settings are still to be added, so the Settings screen shows them as "to be checked". Payment terms vary by contract, so the app always says to check the signed contract.

## Run it on your computer

The app is plain HTML, CSS and JavaScript with no framework and no build step. Browsers only load JavaScript modules from a web server, not straight from a file, so start a small local one in this folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in a browser.

## Run the tests

Every money and date calculation is a small function in `src/calc/` with tests in `tests/`. There is also a test that checks colour contrast in light and dark mode. You need [Node.js](https://nodejs.org) version 22 or later. There are no packages to install.

```bash
node --test
```

## Updating the yacht data

After editing the research spreadsheet, run:

```bash
python3 tools/sheet_to_csv.py "Target Firm Charter Fleets.xlsx"
```

This rewrites `data/yachts.csv` (Fleets tab) and `data/for-sale.csv` (For sale tab). It keeps the web link behind each Source cell, which Excel's own "Save as CSV" would drop. A browser that has already opened the app keeps its own copy: use **Restore published list** on the Import and export screen to pick up the new files.

## How it is built

```
index.html        the page and the menu
styles/main.css   colours, fonts and layout (light and dark mode)
src/app.js        start-up and moving between screens
src/store.js      saving, loading, import and export
src/calc/         the maths: charter, sales, management, currency, dates
src/views/        one file per screen
src/prompts/      the copy-to-Claude prompt and email template
data/             settings, yacht lists and fictional example records
tests/            tests for every calculation
tools/            spreadsheet to CSV converter
```

It was built step by step with Claude Code. [BRIEF.md](BRIEF.md) is the brief and [BUILD_STEPS.md](BUILD_STEPS.md) is the order of work, with the decisions made along the way.

Accessibility: every input has a label, everything works by keyboard (including a "Skip to main content" link), and colours meet WCAG AA contrast in light and dark mode. Every screen has been checked at 390px phone width.
