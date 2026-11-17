# Build steps

Status: **Approved by Miles, 17 Nov 2026.**

Each step is small enough to build, test and explain in one sitting. Steps that only add calculations come before the screens that use them, so every figure on screen is already tested. Tick a step (`[x]`) when it is done.

## Phase 0: Foundations

- [x] **0.1 Project skeleton.** Folder structure from the brief, `git init`, `index.html` with a nav menu and empty screens, `main.css` with design tokens (teal accent, fonts, spacing), light and dark mode, 390px layout. README stub with how to run it.
- [ ] **0.2 Settings file.** `data/settings.json` with every rule of thumb from the brief, each with `value`, `source`, `sourceUrl` and `dateChecked`. Bahamas VAT stored as two values from two sources.
- [ ] **0.3 Date and currency helpers.** `src/calc/dates.js` (format as 17 Nov 2026, days between, add days, banking days) and `src/calc/currency.js` (convert EUR, GBP, USD with the rate date). Tests.
- [ ] **0.4 Store.** `src/store.js`: save and load from localStorage, export everything as JSON, import JSON, "Example data" banner when sample records are present, "Clear example data" button.
- [ ] **0.5 Settings screen.** Edit every setting, see its source and date checked, reset to defaults.
- [ ] **0.6 Yacht data.** Import `data/yachts.csv` (from your research sheet), CSV import screen, export CSV. Each yacht keeps its source link and date checked.

## Phase 1: Charter retail

- [ ] **1.1 Charter maths.** `src/calc/charter.js`: pro rata fee, VAT by cruising area, APA, delivery fee, extras, total, budget band (within / up to 10% over / out), payment schedule from settings. Tests for every function.
- [ ] **1.2 Enquiry log.** Add, edit and list enquiries with the status pipeline and a reason when Lost. Fictional sample enquiries.
- [ ] **1.3 Yacht selection.** Filters (guests, region, season, budget, type), cost breakdown per yacht, budget band pill, currency switch showing the rate date.
- [ ] **1.4 Itinerary builder.** Day by day ports, nautical miles, cruising time at chosen speed, long day flag over 6 hours.
- [ ] **1.5 Proposal.** One-page printable proposal of the top three yachts, copy-to-Claude prompt, fallback email template.
- [ ] **1.6 Contract and payment checklist.** Checklist items, payment schedule with due dates and "check the signed contract" notice.
- [ ] **1.7 Preference sheet.** Form plus one-page captain handover summary.

## Phase 2: Charter management

- [ ] **2.1 Fleet records.** Specs, seasonal rates, bases, crew notes, listing links, "over 90 days old" flag.
- [ ] **2.2 Availability calendar.** Bookings, owner use, first and second options with expiry, clash and expired option detection (logic in `calc`, with tests).
- [ ] **2.3 Owner report.** Weeks booked, gross income, commission split from settings, net to owner, utilisation. Printable. Tests for the commission maths.
- [ ] **2.4 Show booklet.** One printable page per yacht for a chosen boat show.

## Phase 3: Brokerage sales

- [ ] **3.1 Sales maths.** `src/calc/sales.js`: price per metre, running cost estimate, comparables filter (±15% length, ±7 years, same type), median and range, MOA deposit and due date. Tests.
- [ ] **3.2 Listings.** Status, asking price, price history log, days on market.
- [ ] **3.3 Buyer brief and seller view.** Shortlist table and comparables view labelled "asking prices, not sold prices".
- [ ] **3.4 Viewings and owner activity report.**
- [ ] **3.5 Deal tracker.** MYBA MOA stages, each with a date and document checklist.

## Phase 4: Yacht management

- [ ] **4.1 Management maths.** `src/calc/management.js`: red / amber / green expiry status (60 days, a setting), budget variance, full-year forecast. Tests.
- [ ] **4.2 Compliance tracker.**
- [ ] **4.3 Crew records.** Fictional crew and certificates.
- [ ] **4.4 Budget vs actual.**
- [ ] **4.5 Monthly management report.** Printable page.

## Phase 5: Pulling it together

- [ ] **5.1 Dashboard.** Today's to-do list and pipeline counts. Built last because it reads from every module.
- [ ] **5.2 Accessibility and phone check.** Keyboard pass, labels, contrast, 390px check on every screen, em dash check.
- [ ] **5.3 README and publish.** What it is, how to run it, job ad sources, data sources, then GitHub Pages.

## Decisions (17 Nov 2026)

1. **Pro rata charter fee:** weekly rate ÷ 7 × number of days.
2. **Greece VAT:** one "eligible" rate (5.2% default, editable) and one "not eligible" rate (24%), with an eligibility tick box per enquiry.
3. **Research sheet:** Miles will add it to the project folder before step 0.6.
4. **Sources and dates:** never invented. Anything Miles has not confirmed shows "to be checked".
5. **Job ad sources:** no links available. The README names the firms and the duties only, with no links.
