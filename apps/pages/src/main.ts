import { enrichWines, VivinoAlgoliaClient } from '../../../src/index.ts';
import type { AlgoliaWineProfile, WineEnrichmentInput } from '../../../src/index.ts';
import {
  chooseCandidate, displayWineName, initialSelections, ratingFor,
  selectedProfile, selectionSummary,
} from './selection.ts';
import type { FullWineRow, Selection } from './selection.ts';
import { visibleRows, wineTypeFor, WINE_TYPE_LABELS } from './table-view.ts';
import type { TypeFilter, SortKey } from './table-view.ts';
import { createShareLink, parseWineInputs, readWineLink } from './deep-link.ts';
import { shortWineNote } from './notes.ts';
import './style.css';

function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error('Missing element: ' + id);
  return found as T;
}

const form = byId<HTMLFormElement>('enrich-form');
const input = byId<HTMLTextAreaElement>('wines-input');
const inputDetails = byId<HTMLDetailsElement>('input-details');
const status = byId<HTMLParagraphElement>('status');
const resultsBody = byId<HTMLTableSectionElement>('results-body');
const resultsCount = byId<HTMLElement>('results-count');
const typeFilter = byId<HTMLSelectElement>('type-filter');
const sortBy = byId<HTMLSelectElement>('sort-by');
const resetTable = byId<HTMLButtonElement>('reset-table');
const showNotesInput = byId<HTMLInputElement>('show-notes');
const notesHeader = byId<HTMLTableCellElement>('notes-header');
const enrichButton = byId<HTMLButtonElement>('enrich-button');
const connectionButton = byId<HTMLButtonElement>('connection-button');
const shareButton = byId<HTMLButtonElement>('share-button');
const dialog = byId<HTMLDialogElement>('wine-dialog');
const dialogTitle = byId<HTMLElement>('dialog-title');
const dialogSubtitle = byId<HTMLElement>('dialog-subtitle');
const dialogContent = byId<HTMLElement>('dialog-content');
const dialogClose = byId<HTMLButtonElement>('dialog-close');

let inputs: WineEnrichmentInput[] = [];
let rows: FullWineRow[] = [];
let choices: Selection[] = [];
let activeRow: number | null = null;
let lastRowIndex: number | null = null;
let currentTypeFilter: TypeFilter = 'all';
let currentSort: SortKey = 'rating-desc';
let showNotes = false;

function setBusy(busy: boolean): void {
  enrichButton.disabled = busy;
  connectionButton.disabled = busy;
  shareButton.disabled = busy;
  form.setAttribute('aria-busy', String(busy));
}

function parseInputs(): WineEnrichmentInput[] {
  return parseWineInputs(input.value);
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  content?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function safeHttps(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function imageBox(url: string | null | undefined, className: string, alt: string): HTMLElement {
  const container = element('div', className);
  const fallback = () => {
    container.replaceChildren(element('span', 'image-fallback', 'Wine'));
  };
  const source = safeHttps(url);
  if (!source) {
    fallback();
    return container;
  }
  const image = element('img');
  image.src = source;
  image.alt = alt;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', fallback, { once: true });
  container.append(image);
  return container;
}

function ratingLabel(profile: AlgoliaWineProfile): string {
  const rating = ratingFor(profile);
  return rating ? rating.average.toFixed(1) + ' / 5' : 'No rating';
}

function compactRating(cell: HTMLTableCellElement, profile: AlgoliaWineProfile | null): void {
  if (!profile) {
    cell.append(element('span', 'muted', '—'));
    return;
  }
  const rating = ratingFor(profile);
  if (!rating) {
    cell.append(element('span', 'muted', 'Not rated'));
    return;
  }
  const top = element('div', 'table-rating');
  top.append(element('span', 'rating-star', '★'), element('strong', '', rating.average.toFixed(1)));
  cell.append(top, element('span', 'rating-caption',
    (rating.count === null ? 'Unknown count' : rating.count.toLocaleString() + ' ratings') +
    ' · ' + (rating.scope === 'vintage' ? 'Vintage' : 'Overall')));
}

function appendCell(row: HTMLTableRowElement, className = ''): HTMLTableCellElement {
  const td = element('td', className);
  row.append(td);
  return td;
}

function renderTable(): void {
  resultsBody.replaceChildren();
  notesHeader.hidden = !showNotes;
  const summary = selectionSummary(rows, choices);
  const shown = visibleRows(inputs, rows, choices, currentTypeFilter, currentSort);
  resultsCount.textContent = 'Showing ' + shown.length + ' of ' + summary.total +
    (summary.chosen ? ' · ' + summary.chosen + ' reviewed' : '');
  resetTable.hidden = currentTypeFilter === 'all' && currentSort === 'rating-desc';

  if (!shown.length) {
    const empty = element('tr');
    const td = appendCell(empty, 'empty');
    td.colSpan = showNotes ? 5 : 4;
    td.append(element('strong', '', 'No wines match this filter'));
    td.append(element('span', '', 'Try another type or clear the filters.'));
    resultsBody.append(empty);
  }

  shown.forEach(({ index: i }) => {
    const row = rows[i];
    const chosen = choices[i];
    const profile = selectedProfile(row, chosen);
    const tr = element('tr', 'wine-row' + (chosen.chosen ? ' reviewed-row' : ''));
    tr.addEventListener('click', () => openDetail(i));
    const menuCell = appendCell(tr, 'menu-cell');
    menuCell.append(element('strong', 'menu-name', inputs[i].name));
    const inputMeta = inputs[i].year ? String(inputs[i].year) : '';
    if (inputMeta) menuCell.append(element('span', 'menu-subline', inputMeta));
    if (inputs[i].menuPrice !== undefined) {
      menuCell.append(element('span', 'menu-price', String(inputs[i].menuPrice) + ' · Menu'));
    }
    const kind = wineTypeFor(inputs[i], row, chosen);
    menuCell.append(element('span', 'wine-type-tag type-' + kind,
      kind === 'unknown' ? 'Type unknown' : WINE_TYPE_LABELS[kind]));
    if (row.error) menuCell.append(element('span', 'error-hint', 'Partial upstream error'));

    const matchCell = appendCell(tr, 'match-cell');
    const button = element('button', 'match-button') as HTMLButtonElement;
    button.type = 'button';
    button.dataset.rowIndex = String(i);
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-label', 'Inspect matches for ' + inputs[i].name);
    if (profile) {
      button.append(imageBox(profile.wine.imageUrl, 'table-bottle', ''));
      const copy = element('span', 'match-copy');
      copy.append(element('strong', 'match-name', displayWineName(profile)));
      const meta = element('span', 'match-meta',
        (profile.vintage?.year ? profile.vintage.year + ' vintage · ' : '') +
        (chosen.chosen ? 'Your selection' : 'Top suggestion') +
        (row.matches.length > 1 ? ' · ' + row.matches.length + ' options' : ''));
      copy.append(meta);
      button.append(copy);
    } else {
      button.append(element('span', 'unmatched-icon', '?'));
      const copy = element('span', 'match-copy');
      copy.append(element('strong', 'match-name', chosen.chosen ? 'None selected' :
        row.error ? 'Search incomplete' : 'No plausible match'));
      copy.append(element('span', 'match-meta', chosen.chosen ?
        'Marked as unresolved' : row.error ? 'Upstream unavailable' : 'Review input or try again'));
      button.append(copy);
    }
    matchCell.append(button);
    const ratingCell = appendCell(tr, 'rating-cell');
    compactRating(ratingCell, profile);
    if (showNotes) {
      const noteCell = appendCell(tr, 'notes-cell');
      const excerpt = shortWineNote(profile?.description?.text);
      noteCell.append(element('span', excerpt ? 'notes-excerpt' : 'muted',
        excerpt ?? 'No description available'));
    }
    const actionCell = appendCell(tr, 'action-cell');
    actionCell.append(element('span', 'row-arrow', '›'));
    resultsBody.append(tr);
  });
}

function addMetadata(parent: HTMLElement, label: string, value: string | number | boolean | null | undefined): void {
  if (value === null || value === undefined || value === '') return;
  const item = element('div', 'meta-item');
  item.append(element('dt', '', label), element('dd', '', String(value)));
  parent.append(item);
}

function updateChoice(index: number | null): void {
  if (activeRow === null) return;
  choices = chooseCandidate(rows, choices, activeRow, index);
  renderTable();
  renderDetail();
  const focusValue = index === null ? 'none' : String(index);
  const buttons = dialogContent.querySelectorAll<HTMLButtonElement>('button[data-choice]');
  buttons.forEach(button => {
    if (button.dataset.choice === focusValue) button.focus();
  });
}

function renderDetail(): void {
  if (activeRow === null) return;
  const row = rows[activeRow];
  const choice = choices[activeRow];
  const profile = selectedProfile(row, choice);
  dialogSubtitle.textContent = 'Your entry: ' + inputs[activeRow].name +
    (inputs[activeRow].year ? ' · ' + inputs[activeRow].year : '');
  dialogTitle.textContent = profile ? displayWineName(profile) : 'No wine selected';
  dialogContent.replaceChildren();

  if (profile) {
    const hero = element('section', 'detail-hero');
    hero.append(imageBox(profile.wine.imageUrl, 'hero-image', 'Bottle of ' + displayWineName(profile)));
    const heroCopy = element('div', 'hero-copy');
    heroCopy.append(element('p', 'selection-eyebrow', choice.chosen ? 'Chosen for this wine' : 'Top-ranked suggestion'));
    heroCopy.append(element('h3', 'hero-name', displayWineName(profile)));
    const location = [profile.wine.region, profile.wine.country?.toUpperCase()].filter(Boolean).join(' · ');
    if (location) heroCopy.append(element('p', 'hero-location', location));
    const rating = ratingFor(profile);
    const ratingLine = element('div', 'hero-rating');
    if (rating) {
      ratingLine.append(element('span', 'hero-star', '★'), element('strong', 'hero-score', rating.average.toFixed(1)));
      ratingLine.append(element('span', 'hero-rating-description',
        '/ 5 · ' + (rating.scope === 'vintage' ? 'Exact-vintage' : 'Overall wine') + ' rating'));
    } else ratingLine.append(element('span', 'muted', 'No verified rating available'));
    heroCopy.append(ratingLine);
    if (rating) {
      const counts = [
        rating.count === null ? null : rating.count.toLocaleString() + ' ratings',
        rating.reviewsCount === null ? null : rating.reviewsCount.toLocaleString() + ' written reviews',
      ].filter(Boolean).join('  ·  ');
      if (counts) heroCopy.append(element('p', 'rating-counts', counts));
    }
    hero.append(heroCopy);
    dialogContent.append(hero);

    const info = element('section', 'detail-info');
    info.append(element('h4', 'detail-subheading', 'Full wine description'));
    if (profile.description?.text) {
      info.append(element('p', 'description', profile.description.text));
      info.append(element('p', 'scope-note', 'Source: Vivino wine-level description; not necessarily vintage-specific.'));
    } else {
      info.append(element('p', 'description muted', 'No description available from Vivino for this wine.'));
    }
    const metadata = element('dl', 'metadata-grid');
    const selectedType = wineTypeFor(inputs[activeRow], row, choice);
    addMetadata(metadata, 'Wine type', selectedType === 'unknown' ? 'Unknown' : WINE_TYPE_LABELS[selectedType]);
    addMetadata(metadata, 'Producer', profile.wine.winery);
    addMetadata(metadata, 'Region', profile.wine.region);
    addMetadata(metadata, 'Country', profile.wine.country?.toUpperCase());
    addMetadata(metadata, 'Confirmed vintage', profile.vintage?.year);
    addMetadata(metadata, 'Alcohol', profile.wine.alcohol === null ? null : profile.wine.alcohol + '%');
    addMetadata(metadata, 'Closure', profile.wine.closure);
    if (metadata.childElementCount) info.append(metadata);
    if (profile.warnings.length) {
      const warnings = element('div', 'detail-warning');
      for (const warning of profile.warnings) warnings.append(element('p', '', warning));
      info.append(warnings);
    }
    const url = safeHttps(profile.sourceUrl);
    if (url) {
      const anchor = element('a', 'source-link', 'Open on Vivino ↗');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      info.append(anchor);
    }
    dialogContent.append(info);
  } else {
    const empty = element('div', 'detail-empty');
    empty.append(element('div', 'detail-empty-symbol', '◇'));
    empty.append(element('h3', '', row.matches.length ? 'No match selected' : 'No candidates found'));
    empty.append(element('p', '', row.matches.length
      ? 'You have marked this entry as unresolved. Choose an option below to change it.'
      : row.error
        ? 'The upstream search failed or returned incomplete results. Try the search again.'
        : 'No plausible candidates were returned. Try adjusting the wine name or vintage.'));
    dialogContent.append(empty);
  }

  const menuInput = inputs[activeRow];
  const sourceMeta = menuInput.metadata;
  if (menuInput.menuPrice !== undefined || (sourceMeta && Object.keys(sourceMeta).length)) {
    const menuDetails = element('section', 'menu-details');
    menuDetails.append(element('h3', 'detail-subheading', 'From the restaurant menu'));
    const details = element('dl', 'metadata-grid');
    addMetadata(details, 'Menu price', menuInput.menuPrice);
    for (const [key, value] of Object.entries(sourceMeta ?? {})) {
      const label = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
      addMetadata(details, label.charAt(0).toUpperCase() + label.slice(1), value);
    }
    menuDetails.append(details);
    dialogContent.append(menuDetails);
  }

  const section = element('section', 'choices-section');
  const title = element('div', 'choices-heading');
  title.append(element('h3', '', 'Choose a match'));
  title.append(element('p', '', 'Select any candidate to update the table immediately.'));
  section.append(title);
  const options = element('div', 'options-list');
  row.matches.forEach((candidate, i) => {
    const selected = choice.index === i;
    const button = element('button', 'option-button' + (selected ? ' is-current' : '')) as HTMLButtonElement;
    button.type = 'button';
    button.dataset.choice = String(i);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', 'Choose ' + displayWineName(candidate));
    button.append(imageBox(candidate.wine.imageUrl, 'option-image', ''));
    const copy = element('span', 'option-copy');
    copy.append(element('strong', 'option-name', displayWineName(candidate)));
    const indexedType = candidate.wine.typeId;
    const indexedName = indexedType === 1 ? 'Red' : indexedType === 2 ? 'White' :
      indexedType === 3 ? 'Sparkling' : indexedType === 4 ? 'Rosé' :
      indexedType === 7 ? 'Dessert' : indexedType === 24 ? 'Fortified' : null;
    const region = [candidate.vintage?.year, indexedName, candidate.wine.region].filter(Boolean).join(' · ');
    if (region) copy.append(element('span', 'option-location', region));
    const stat = element('span', 'option-rating', '★ ' + ratingLabel(candidate) + ' · ' +
      (ratingFor(candidate)?.scope === 'vintage' ? 'Vintage' : ratingFor(candidate) ? 'Overall' : 'Unrated'));
    copy.append(stat);
    button.append(copy, element('span', 'option-check', selected ? '✓' : '+'));
    button.addEventListener('click', () => updateChoice(i));
    options.append(button);
  });
  if (row.matches.length) {
    const none = element('button', 'option-button option-none' +
      (choice.index === null ? ' is-current' : '')) as HTMLButtonElement;
    none.type = 'button';
    none.dataset.choice = 'none';
    none.setAttribute('aria-pressed', String(choice.index === null));
    none.append(element('span', 'none-icon', '×'));
    const noneCopy = element('span', 'option-copy');
    noneCopy.append(element('strong', 'option-name', 'None of these'));
    noneCopy.append(element('span', 'option-location', 'Leave this menu entry unresolved'));
    none.append(noneCopy, element('span', 'option-check', choice.index === null ? '✓' : '+'));
    none.addEventListener('click', () => updateChoice(null));
    options.append(none);
  }
  if (!row.matches.length) {
    section.append(element('p', 'no-options', 'There are no alternatives to choose from for this input.'));
  } else {
    section.append(options);
  }
  if (row.error) {
    section.append(element('p', 'detail-error',
      'Some results may be missing because the upstream service was unavailable.'));
  }
  dialogContent.append(section);
}

function openDetail(rowIndex: number): void {
  if (rowIndex < 0 || rowIndex >= rows.length) return;
  activeRow = rowIndex;
  lastRowIndex = rowIndex;
  renderDetail();
  if (!dialog.open) dialog.showModal();
  dialogClose.focus();
}

dialogClose.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});
dialog.addEventListener('close', () => {
  activeRow = null;
  // Table rows are replaced when a selection changes; restore focus by row index.
  if (lastRowIndex !== null) {
    const originalButton = resultsBody.querySelector<HTMLButtonElement>(
      'button[data-row-index="' + lastRowIndex + '"]');
    (originalButton ?? typeFilter).focus();
  }
  lastRowIndex = null;
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const pendingInputs = parseInputs();
    setBusy(true);
    status.textContent = 'Searching for wine candidates…';
    const pendingRows = await enrichWines(pendingInputs, { returnAll: true });
    inputs = pendingInputs;
    rows = pendingRows;
    choices = initialSelections(rows);
    currentTypeFilter = 'all';
    currentSort = 'rating-desc';
    typeFilter.value = 'all';
    sortBy.value = 'rating-desc';
    typeFilter.disabled = false;
    sortBy.disabled = false;
    renderTable();
    inputDetails.open = false;
    const summary = selectionSummary(rows, choices);
    status.textContent = summary.upstreamErrors
      ? 'Completed with ' + summary.upstreamErrors + ' upstream error(s). Some candidates may be missing.'
      : 'Found candidates for ' + (summary.total - summary.noCandidates) + ' of ' + summary.total +
        ' wines. Open any row to review its options.';
  } catch (error) {
    status.textContent = 'Error: ' + (error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(false);
  }
});

connectionButton.addEventListener('click', async () => {
  setBusy(true);
  status.textContent = 'Checking the browser connection to Vivino Algolia…';
  try {
    const { candidates, total } = await new VivinoAlgoliaClient().searchWines('Opus One', 1);
    status.textContent = 'Connection successful: ' + total +
      ' indexed hits. First result: ' + (candidates[0]?.name ?? 'none') + '.';
  } catch (error) {
    status.textContent = 'Connection failed: ' + (error instanceof Error ? error.message : String(error)) +
      '. Browser network/CORS restrictions may be involved.';
  } finally {
    setBusy(false);
  }
});

typeFilter.addEventListener('change', () => {
  currentTypeFilter = typeFilter.value as TypeFilter;
  renderTable();
});

sortBy.addEventListener('change', () => {
  currentSort = sortBy.value as SortKey;
  renderTable();
});

resetTable.addEventListener('click', () => {
  currentTypeFilter = 'all';
  currentSort = 'rating-desc';
  typeFilter.value = 'all';
  sortBy.value = 'rating-desc';
  renderTable();
  typeFilter.focus();
});

shareButton.addEventListener('click', async () => {
  try {
    const wines = parseInputs();
    const { url, compressed } = await createShareLink(window.location.href, wines, true);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      status.textContent = 'Share link copied (' + wines.length + ' wines, ' +
        url.length + ' characters' + (compressed ? ', compressed' : '') +
        '). Opening it automatically enriches the list.';
    } else {
      window.prompt('Copy this link:', url);
      status.textContent = 'Generated a shareable link for ' + wines.length + ' wines.';
    }
  } catch (error) {
    status.textContent = 'Unable to create share link: ' +
      (error instanceof Error ? error.message : String(error));
  }
});

// Import on initial load only: no network call unless the URL explicitly opts into autorun.
void (async () => {
  try {
    const imported = await readWineLink(window.location.hash);
    if (!imported) return;
    input.value = JSON.stringify(imported.wines, null, 2);
    status.textContent = 'Imported ' + imported.wines.length +
      ' wines from your link' + (imported.autorun ? '; searching now…' : '. Review the list and find matches.') ;
    if (imported.autorun) form.requestSubmit();
  } catch (error) {
    status.textContent = 'Invalid wine link: ' +
      (error instanceof Error ? error.message : String(error)) +
      '. No automatic search was started.';
    inputDetails.open = true;
  }
})();

showNotesInput.addEventListener('change', () => {
  showNotes = showNotesInput.checked;
  if (rows.length) renderTable();
  else notesHeader.hidden = !showNotes;
});
