// Start-up and navigation.
//
// The app is one page. Which screen you see depends on the part of the
// address after the "#", for example index.html#/enquiries. Links like this
// work on GitHub Pages with no server set-up, and the browser's Back button
// works as you would expect.

import { load, loadDefaultSettings, onChange, getState, hasExampleData, clearExampleData, isStorageWorking, hasCollection, saveCollection } from './store.js';
import { KINDS, fetchPublished } from './yachts.js';
import * as dataView from './views/data.js';
import * as settingsView from './views/settings.js';

// Screens that have been built. Each view file exports render(container).
// Any screen not listed here shows a placeholder.
const VIEWS = {
  data: dataView,
  settings: settingsView,
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

// Read the screen name from the address, e.g. "#/fleet" gives "fleet".
function currentScreenId() {
  const id = location.hash.replace(/^#\/?/, '');
  return ALL_SCREENS.some((s) => s.id === id) ? id : DEFAULT_SCREEN;
}

// Show the screen named in the address.
// Until a screen is built, it shows a placeholder naming its build step.
function showScreen({ moveFocus }) {
  const screen = ALL_SCREENS.find((s) => s.id === currentScreenId());

  main.replaceChildren();

  const title = document.createElement('h1');
  title.textContent = screen.title;
  title.tabIndex = -1; // lets us move keyboard focus here after navigating

  main.append(title);

  if (VIEWS[screen.id]) {
    VIEWS[screen.id].render(main);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    placeholder.innerHTML = `
      <p>This screen has not been built yet.</p>
      <p class="muted">Planned in build step ${screen.step}.</p>`;
    main.append(placeholder);
  }
  document.title = `${screen.title} | Yacht Proposal Builder`;

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
onChange(() => {
  updateBanners();
});
buildNav();
updateBanners();
showScreen({ moveFocus: false });
