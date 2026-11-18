// Fetch today's European Central Bank reference rates and save the GBP
// and USD rates into data/settings.json.
//
//     node tools/update-rates.js              fetch from the ECB
//     node tools/update-rates.js rates.xml    use a saved copy instead
//
// Run each weekday by .github/workflows/update-rates.yml, so the site
// itself never calls an API. The ECB publishes the rates at about 16:00
// Frankfurt time on working days. No key is needed.
//
// Uses only Node's standard library: nothing to install.

import { readFileSync, writeFileSync } from 'node:fs';
import { parseEcbRates } from '../src/calc/currency.js';

const ECB_XML = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const ECB_PAGE = 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html';
const SETTINGS = new URL('../data/settings.json', import.meta.url);

const file = process.argv[2];
const xml = file ? readFileSync(file, 'utf8') : await (await fetch(ECB_XML)).text();

const rates = parseEcbRates(xml);
if (!rates) {
  console.error('Could not read GBP and USD rates from the ECB file. Settings not changed.');
  process.exit(1);
}

const data = JSON.parse(readFileSync(SETTINGS, 'utf8'));
for (const [id, code] of [['currency.gbpPerEur', 'GBP'], ['currency.usdPerEur', 'USD']]) {
  const setting = data.settings.find((s) => s.id === id);
  Object.assign(setting, {
    value: rates[code],
    source: 'European Central Bank reference rate',
    sourceUrl: ECB_PAGE,
    dateChecked: rates.date,
  });
}
writeFileSync(SETTINGS, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Saved ECB rates for ${rates.date}: EUR 1 = GBP ${rates.GBP}, USD ${rates.USD}`);
