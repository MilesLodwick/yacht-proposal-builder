# Yacht Proposal Builder: rules for Claude Code

The full brief is in [BRIEF.md](BRIEF.md). The agreed order of work is in [BUILD_STEPS.md](BUILD_STEPS.md). Read both before starting any step.

## How to work

- One step from BUILD_STEPS.md at a time. Stop at the end of each step and explain in plain English what was built and why, so Miles can explain it in an interview.
- Do not build anything that is not in BUILD_STEPS.md without asking first.
- Simple, readable code over clever code. Short comments wherever yachting logic lives (VAT, APA, commission, payment schedules, MOA deposit).
- Tick the step off in BUILD_STEPS.md when it is done.

## Going live

Miles wants every change he asks for to go straight to the live site. GitHub Pages builds from `main`, so after each change:

1. Run `node --test` and check the change in a browser. Do not go live if anything fails.
2. Commit on the working branch, then merge it into `main` and push `main` (as well as the working branch).
3. Tell Miles it is live, and that Pages takes a minute or two to update. Open pages reload themselves onto the new version (src/update.js), and the menu shows the published time ("Version: ...") so he can check which version he has.

This is standing permission to push to `main`. Never force-push `main`.

## Hard rules

1. No API keys or secrets. AI features build a prompt for the user to copy into Claude. Never call an API from the browser.
2. No real personal data. People in sample data are fictional. Yachts are real public listings with a source link and date checked.
3. Every market figure shows a source link and date checked. Rates are labelled "indicative".
4. Every rule of thumb is a setting with defaults in `data/settings.json`. No magic numbers in `src/`.
5. British English. Euros by default, GBP and USD available. Dates display as `17 Nov 2026`. No em dashes in any user-facing text.
6. Works at 390px and on desktop. Light and dark mode.
7. Accessible: every input has a label, everything works by keyboard, good contrast.

## Tech

- Plain HTML, CSS, JavaScript ES modules. No framework, no build step, no npm dependencies.
- Hosted on GitHub Pages. Data in localStorage with JSON and CSV export and import.
- Money and date logic lives in pure functions in `src/calc/`. Every money calculation has a test in `tests/`, run with `node --test`.
- Run locally with `python3 -m http.server 8000` (ES modules do not load from `file://`).
