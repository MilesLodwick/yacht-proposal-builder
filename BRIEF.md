Yacht Proposal Builder: project brief for Claude Code

## Who I am and why this exists

I'm Miles Lodwick. I'm moving from retail sales into shore-based yachting roles: charter assistant or coordinator, charter management assistant, brokerage or sales assistant, and yacht management assistant. This project is a working demo of the day-to-day jobs those roles do. Brokers and hiring managers will open it, so it must be accurate, honest and easy to use on a phone.

I'm building it with Claude Code. I need to be able to explain every part of it in an interview, so:

* Work in small steps. After each step, explain in plain English what you built and why.
* Prefer simple, readable code over clever code. Add short comments where the yachting logic lives (VAT, APA, commission, payment schedules).
* Never add a feature I haven't asked for in BUILD_STEPS.md without checking with me first.

## Hard rules

1. No API keys or secrets anywhere in this repo. The site is public. AI features work by building a prompt the user copies into Claude, never by calling an API from the browser.
2. No real personal data. Clients, guests, crew and owners in sample data are fictional. Yachts are real public listings with a source link and a date checked.
3. Every figure that comes from the market shows where it came from: a source link and a date checked. Rates are labelled "indicative".
4. Every rule of thumb is a setting, not a hard-coded number: VAT rates, APA %, commission splits, payment schedule, running cost %, currency rates. Defaults live in `data/settings.json`.
5. British English, euros by default (with GBP and USD available), dates as 17 Nov 2026. No em dashes in any user-facing text.
6. Works at phone width (390px) and on desktop. Light and dark mode.
7. Accessible: proper labels on every input, keyboard usable, good contrast.

## Tech choices (keep it simple and explainable)

* Plain HTML, CSS and JavaScript ES modules. No framework, no build step.
* Hosted free on GitHub Pages.
* Data is saved in the browser (localStorage), with Export and Import as JSON and CSV so nothing is lost.
* Calculations live in pure functions in `src/calc/` with tests using Node's built-in test runner (`node --test`). Every money calculation has a test.

## Folder structure

```
index.html
styles/          main.css (design tokens at the top)
src/
  app.js         start-up and navigation
  store.js       load, save, import, export
  calc/          charter.js, sales.js, management.js, currency.js, dates.js (pure functions + tests)
  views/         one file per screen
  prompts/       builds the copy-to-Claude prompts and email templates
data/
  settings.json  VAT table, APA %, commission, payment terms, currency rates
  yachts.csv     verified yacht data (from my research sheet)
tests/
README.md        what it is, how to run it, sources
```

## What the tool must cover (mapped to real job ads)

Each module below comes from duties listed in real job adverts at Burgess, Fraser, Northrop & Johnson and others. The README should list these sources.

### 1. Dashboard (all roles)

* Today's to-do list built from the data: options expiring, payments due, certificates expiring, enquiries not answered in 24 hours.
* Status counts for each pipeline.

### 2. Charter: retail (charter assistant / coordinator)

Duties from ads: present yacht selections, create itineraries, draft MYBA contracts, handle enquiries and bookings, update the CRM.

* Enquiry log (simple CRM): client (fictional), source (direct or which broker), dates, guests, budget, region, notes. Status pipeline: New, Proposal sent, Option held, Contract out, Signed, Balance paid, On charter, Completed, Lost (with a reason).
* Yacht selection: filter by guests, region and season, budget, type. Cost breakdown per yacht: pro rata charter fee, VAT for the cruising area, APA %, delivery fee, extras. Within budget / up to 10% over / out.
* Currency: show totals in EUR, USD or GBP using manual rates in settings, with the rate date shown.
* Itinerary builder: day by day ports, nautical miles per leg, cruising time at a chosen speed (distance ÷ speed). Flag legs over 6 hours as long days.
* Proposal: a clean one-page proposal view of the top three yachts, plus a copy-to-Claude prompt and a fallback email template.
* Contract and payment checklist: KYC done, contract signed, deposit received, balance received, APA received, preference sheet received, guest list received. Payment schedule worked out from settings (deposit % on signing, balance and APA X days before embarkation). These terms vary by contract, so they are settings, and the UI says to check the signed contract.
* Preference sheet: guests, dietary needs and allergies, activities, arrival time and place, special occasions. Produces a one-page handover summary for the captain.

### 3. Charter: management / central agency (charter management assistant)

Duties from ads: keep yacht information current on Yachtfolio and listing sites, availability calendars, APA and VAT payments, annual and monthly owner reports, charter show attendance, central agency proposals.

* Fleet records: specs, rates by season, summer and winter bases, crew profile notes, listing links, date last updated. Flag any yacht whose details are over 90 days old.
* Availability calendar per yacht: bookings, owner use (which takes priority), first and second options with expiry dates. Detect clashes and expired options.
* Owner report: charter weeks booked, gross charter income, commission split (settings, e.g. total commission, retail broker share, central agent share), net to owner, utilisation through the season. Printable view.
* Show booklet: one page per yacht for a chosen boat show, for brokers to carry.

### 4. Brokerage: sales (sales assistant)

Duties from ads: central agency listings, enquiry tracking, activity reports for owners, organising viewings, due diligence, contracts and closings.

* Listings: central agency yachts for sale with status (Active, Under offer, Sold, Withdrawn), asking price, price history log (reductions with dates), days on market.
* Buyer brief: shortlist with asking price, price per metre, estimated annual running cost (% of value, a setting).
* Seller view: comparables within ±15% length and ±7 years, same type. Median price per metre, range, where the owner's price sits. Labelled "asking prices, not sold prices".
* Viewings log per listing, and an owner activity report (enquiries, viewings, feedback).
* Deal tracker (MYBA MOA stages): offer agreed, MOA signed, deposit received (default 10% within 4 banking days, a setting), sea trial, survey, defects resolved or price reduced, acceptance letter, closing (balance paid, bill of sale, protocol of delivery and acceptance), commission. Each stage has a date and a document checklist.

### 5. Yacht management (yacht management assistant)

Duties from ads: ISM, ISPS and MLC audits, crew certification, operating budget against actual spend, monthly management reports, liaising with agents on berths and fuel.

* Compliance tracker: certificates and audits with expiry dates (ISM, ISPS, MLC, class surveys, flag, insurance). Red if overdue, amber within 60 days, green otherwise.
* Crew records: fictional crew, role, certificates (STCW, ENG1, Certificate of Competency) with expiry dates, same colour rules.
* Budget vs actual: categories (crew, insurance, berthing, fuel, maintenance and refit, provisions, admin and fees). Monthly actuals, variance, full-year forecast.
* Monthly management report: one printable page pulling the above together.

### 6. Settings and data

* Settings screen for every rule of thumb, each with its source and the date checked.
* Import yachts from CSV (my research sheet), export everything as JSON.
* An "Example data" banner whenever sample records are present.

## Known assumptions to keep as editable settings (with sources)

* Charter VAT by country: France 20%, Italy 22%, Spain 21%, Croatia 13%, Greece 5.2 to 13% when eligible (24% otherwise), Montenegro 0%, most of the Caribbean 0%, Bahamas 10% or 14% (sources disagree: show both). Sources: TWW Yachts and IYC VAT guides.
* APA: 25 to 40% of the charter fee, default 30% (IYC).
* Crew gratuity guide: 10 to 20% of the charter fee, not part of the contract (YachtCharterFleet).
* Charter commission example: 20% of the charter fee, split 15% to the retail broker and 5% to the central agent (IYC charter management page).
* Sale deposit under the MYBA MOA: 10% within four banking days; sea trial and survey before acceptance (Breeze Yachting guide). Check against the current MOA.
* Running costs: about 10% of a yacht's value a year (industry rule of thumb).

## Design direction

Clean, calm and professional, like software a brokerage would actually use. Deep teal accent, IBM Plex Sans for text, IBM Plex Mono for figures, Archivo for headings. Cards only where they separate things. Numbers right-aligned in tables. Colour coded status pills (green, amber, red) for anything with a deadline.
