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

## Sources

To follow: job adverts the modules are based on, and the sources for every setting.
