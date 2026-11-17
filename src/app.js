// Start-up and navigation.
//
// The app is one page. Which screen you see depends on the part of the
// address after the "#", for example index.html#/enquiries. Links like this
// work on GitHub Pages with no server set-up, and the browser's Back button
// works as you would expect.

import { load, loadDefaultSettings, onChange, getState, hasExampleData, clearExampleData, isStorageWorking, hasCollection, saveCollection, getCollection } from './store.js';
import { KINDS, fetchPublished } from './yachts.js';
import { buildSamples } from './enquiries.js';
import { todayISO } from './calc/dates.js';
import * as dataView from './views/data.js';
import * as settingsView from './views/settings.js';
import * as enquiriesView from './views/enquiries.js';
import * as selectionView from './views/selection.js';
import * as itineraryView from './views/itinerary.js';
import * as proposalView from './views/proposal.js';
import * as contractsView from './views/contracts.js';
import * as preferencesView from './views/preferences.js';
import * as fleetView from './views/fleet.js';
import * as availabilityView from './views/availability.js';
import * as ownerReportView from './views/owner-report.js';
import * as showBookletView from './views/show-booklet.js';
import * as listingsView from './views/listings.js';
import * as buyerBriefView from './views/buyer-brief.js';
import * as sellerView from './views/seller-view.js';
import * as viewingsView from './views/viewings.js';
import * as dealsView from './views/deals.js';
import * as complianceView from './views/compliance.js';
import { buildSampleManaged } from './compliance.js';
import { buildSampleDeals } from './deals.js';
import { buildSampleActivity } from './activity.js';
import { buildSampleBriefs } from './buyer.js';
import { buildSampleBooklets } from './booklet.js';
import { buildSampleAvailability } from './calc/availability.js';
import { buildSamplePreferences } from './preferences.js';
import { buildSampleContracts } from './contracts.js';
import { buildSampleItineraries } from './calc/itinerary.js';

// Screens that have been built. Each view file exports
// render(container, param, heading). Any screen not listed here shows a
// placeholder.
const VIEWS = {
  data: dataView,
  settings: settingsView,
  enquiries: enquiriesView,
  selection: selectionView,
  itinerary: itineraryView,
  proposal: proposalView,
  contracts: contractsView,
  preferences: preferencesView,
  fleet: fleetView,
  availability: availabilityView,
  'owner-report': ownerReportView,
  'show-booklet': showBookletView,
  listings: listingsView,
  'buyer-brief': buyerBriefView,
  'seller-view': sellerView,
  viewings: viewingsView,
  deals: dealsView,
  compliance: complianceView,
};

// Every screen in the app, grouped the same way as the job roles in the brief.
// "step" is the step in BUILD_STEPS.md that builds it.
const SECTIONS = [
  {
    heading: null,
    screens: [{ id: 'dashboard', title: 'Dashboard', step: '5.1' }],
  },
  {
    heading: 'Charter',
    screens: [
      { id: 'enquiries', title: 'Enquiries', step: '1.2' },
      { id: 'selection', title: 'Yacht selection', step: '1.3' },
      { id: 'itinerary', title: 'Itinerary', step: '1.4' },
      { id: 'proposal', title: 'Proposal', step: '1.5' },
      { id: 'contracts', title: 'Contracts and payments', step: '1.6' },
      { id: 'preferences', title: 'Preference sheets', step: '1.7' },
    ],
  },
  {
    heading: 'Charter management',
    screens: [
      { id: 'fleet', title: 'Fleet records', step: '2.1' },
      { id: 'availability', title: 'Availability', step: '2.2' },
      { id: 'owner-report', title: 'Owner report', step: '2.3' },
      { id: 'show-booklet', title: 'Show booklet', step: '2.4' },
    ],
  },
  {
    heading: 'Brokerage sales',
    screens: [
      { id: 'listings', title: 'Listings', step: '3.2' },
      { id: 'buyer-brief', title: 'Buyer brief', step: '3.3' },
      { id: 'seller-view', title: 'Seller view', step: '3.3' },
      { id: 'viewings', title: 'Viewings', step: '3.4' },
      { id: 'deals', title: 'Deal tracker', step: '3.5' },
    ],
  },
  {
    heading: 'Yacht management',
    screens: [
      { id: 'compliance', title: 'Compliance', step: '4.2' },
      { id: 'crew', title: 'Crew records', step: '4.3' },
      { id: 'budget', title: 'Budget vs actual', step: '4.4' },
      { id: 'monthly-report', title: 'Monthly report', step: '4.5' },
    ],
  },
  {
    heading: 'Settings and data',
    screens: [
      { id: 'settings', title: 'Settings', step: '0.5' },
      { id: 'data', title: 'Import and export', step: '0.4' },
    ],
  },
];

const ALL_SCREENS = SECTIONS.flatMap((section) => section.screens);
const DEFAULT_SCREEN = 'dashboard';

const nav = document.getElementById('site-nav');
const main = document.getElementById('main');
const menuButton = document.querySelector('.menu-button');

// Build the navigation menu from the SECTIONS list above.
function buildNav() {
  for (const section of SECTIONS) {
    const group = document.createElement('div');
    group.className = 'nav-group';

    const list = document.createElement('ul');
    list.className = 'nav-list';

    if (section.heading) {
      const heading = document.createElement('h2');
      heading.className = 'nav-heading';
      heading.id = `nav-${section.screens[0].id}`;
      heading.textContent = section.heading;
      list.setAttribute('aria-labelledby', heading.id);
      group.append(heading);
    }

    for (const screen of section.screens) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#/${screen.id}`;
      link.textContent = screen.title;
      link.dataset.screen = screen.id;
      item.append(link);
      list.append(item);
    }

    group.append(list);
    nav.append(group);
  }
}

// Read the screen from the address. "#/fleet" gives { id: 'fleet' }.
// Some screens have sub-pages: "#/enquiries/new" gives
// { id: 'enquiries', param: 'new' }.
function currentRoute() {
  const [id, param = null] = location.hash.replace(/^#\/?/, '').split('/');
  return ALL_SCREENS.some((s) => s.id === id) ? { id, param } : { id: DEFAULT_SCREEN, param: null };
}

// Show the screen named in the address.
// Until a screen is built, it shows a placeholder naming its build step.
function showScreen({ moveFocus }) {
  const route = currentRoute();
  const screen = ALL_SCREENS.find((s) => s.id === route.id);

  main.replaceChildren();

  const title = document.createElement('h1');
  title.textContent = screen.title;
  title.tabIndex = -1; // lets us move keyboard focus here after navigating

  main.append(title);

  if (VIEWS[screen.id]) {
    // A view may change the heading for a sub-page, e.g. "New enquiry".
    VIEWS[screen.id].render(main, route.param, title);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    placeholder.innerHTML = `
      <p>This screen has not been built yet.</p>
      <p class="muted">Planned in build step ${screen.step}.</p>`;
    main.append(placeholder);
  }
  document.title = `${title.textContent} | Yacht Proposal Builder`;

  // Highlight the current link (and tell screen readers which page this is).
  for (const link of nav.querySelectorAll('a')) {
    if (link.dataset.screen === screen.id) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  }

  setMenuOpen(false);

  // After a click in the menu, move focus to the new heading so keyboard and
  // screen reader users start at the top of the new screen.
  if (moveFocus) title.focus();
}

// Phone menu: open and close it, and keep aria-expanded in step.
function setMenuOpen(open) {
  nav.classList.toggle('is-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
}

menuButton.addEventListener('click', () => {
  setMenuOpen(menuButton.getAttribute('aria-expanded') !== 'true');
});

// Escape closes the phone menu and returns focus to the Menu button.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && nav.classList.contains('is-open')) {
    setMenuOpen(false);
    menuButton.focus();
  }
});

// Banners: "Example data" when any sample record is present, and a warning
// if the browser will not save.
const exampleBanner = document.getElementById('example-banner');
const storageWarning = document.getElementById('storage-warning');

function updateBanners() {
  exampleBanner.hidden = !hasExampleData(getState());
  storageWarning.hidden = isStorageWorking();
}

document.getElementById('clear-example-data').addEventListener('click', () => {
  const confirmed = window.confirm('Remove all example records? Your own records are kept.');
  if (!confirmed) return;
  clearExampleData();
  showScreen({ moveFocus: true }); // redraw the current screen without the samples
});

window.addEventListener('hashchange', () => showScreen({ moveFocus: true }));

// Start-up: load saved data and the default settings, then draw the menu,
// banners and first screen.
load();
await loadDefaultSettings();

// First visit: load the published yacht lists from data/*.csv so there is
// something to work with. After that, the browser's own copy is used, so
// the user's edits and imports are never overwritten.
for (const kind of Object.keys(KINDS)) {
  if (!hasCollection(kind)) {
    const result = await fetchPublished(kind);
    if (result.ok) saveCollection(kind, result.records);
  }
}

// First visit: add the fictional sample enquiries (marked as examples, so
// the Example data banner shows and one button removes them).
if (!hasCollection('enquiries')) {
  const response = await fetch('data/sample-enquiries.json');
  if (response.ok) {
    const { enquiries } = await response.json();
    saveCollection('enquiries', buildSamples(enquiries, todayISO()));
  }
}
if (!hasCollection('itineraries')) {
  const response = await fetch('data/sample-itineraries.json');
  if (response.ok) {
    const { itineraries } = await response.json();
    saveCollection('itineraries', buildSampleItineraries(itineraries, todayISO()));
  }
}
if (!hasCollection('contracts')) {
  const response = await fetch('data/sample-contracts.json');
  if (response.ok) {
    const { contracts } = await response.json();
    saveCollection('contracts', buildSampleContracts(contracts, todayISO()));
  }
}
if (!hasCollection('preferences')) {
  const response = await fetch('data/sample-preferences.json');
  if (response.ok) {
    const { sheets } = await response.json();
    saveCollection('preferences', buildSamplePreferences(sheets, getCollection('enquiries')));
  }
}
if (!hasCollection('availability')) {
  const response = await fetch('data/sample-availability.json');
  if (response.ok) {
    const { entries } = await response.json();
    saveCollection('availability', buildSampleAvailability(entries, todayISO()));
  }
}
if (!hasCollection('booklets')) {
  const response = await fetch('data/sample-booklets.json');
  if (response.ok) {
    const { booklets } = await response.json();
    saveCollection('booklets', buildSampleBooklets(booklets, todayISO()));
  }
}
if (!hasCollection('buyerBriefs')) {
  const response = await fetch('data/sample-briefs.json');
  if (response.ok) {
    const { briefs } = await response.json();
    saveCollection('buyerBriefs', buildSampleBriefs(briefs));
  }
}
if (!hasCollection('saleActivity')) {
  const response = await fetch('data/sample-activity.json');
  if (response.ok) {
    const { entries } = await response.json();
    saveCollection('saleActivity', buildSampleActivity(entries, todayISO()));
  }
}
if (!hasCollection('deals')) {
  const response = await fetch('data/sample-deals.json');
  if (response.ok) {
    const { deals } = await response.json();
    saveCollection('deals', buildSampleDeals(deals, todayISO()));
  }
}
if (!hasCollection('managedYachts')) {
  const response = await fetch('data/sample-managed.json');
  if (response.ok) {
    const sample = buildSampleManaged(await response.json(), todayISO());
    saveCollection('managedYachts', sample.yachts);
    saveCollection('compliance', sample.items);
  }
}
onChange(() => {
  updateBanners();
});
buildNav();
updateBanners();
showScreen({ moveFocus: false });
