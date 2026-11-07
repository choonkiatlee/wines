import { enrichWines, VivinoAlgoliaClient } from '../../../src/index.ts';
import type { AlgoliaWineProfile, WineEnrichmentInput } from '../../../src/index.ts';
import {
  chooseCandidate, displayWineName, initialSelections, ratingFor,
  selectedProfile, selectionSummary,
} from './selection.ts';
import type { FullWineRow, Selection } from './selection.ts';
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
const enrichButton = byId<HTMLButtonElement>('enrich-button');
const connectionButton = byId<HTMLButtonElement>('connection-button');
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

function setBusy(busy: boolean): void {
  enrichButton.disabled = busy;
  connectionButton.disabled = busy;
  form.setAttribute('aria-busy', String(busy));
}

function parseInputs(): WineEnrichmentInput[] {
  const parsed: unknown = JSON.parse(input.value);
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error('Provide a non-empty JSON array of wines.');
  }
  if (parsed.length > 30) throw new Error('Please test no more than 30 wines per batch.');
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('Each wine must be an object.');
    }
    const row = item as Record<string, unknown>;
    if (typeof row.name !== 'string' || !row.name.trim()) {
      throw new Error('Every item needs a non-empty name string.');
    }
    if (row.year !== undefined &&
        (!Number.isInteger(row.year) || (row.year as number) < 1800 || (row.year as number) > 2100)) {
      throw new Error('Years must be valid four-digit vintages.');
    }
    if (row.type !== undefined &&
        !['red', 'white', 'rose', 'sparkling', 'dessert', 'fortified'].includes(String(row.type))) {
      throw new Error('Unknown wine type.');
    }
  }
  return parsed as WineEnrichmentInput[];
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
  const summary = selectionSummary(rows, choices);
  resultsCount.textContent = summary.total + ' wine' + (summary.total === 1 ? '' : 's') +
    (summary.chosen ? ' · ' + summary.chosen + ' reviewed' : '') +
    (summary.noCandidates ? ' · ' + summary.noCandidates + ' without matches' : '');

  rows.forEach((row, i) => {
    const chosen = choices[i];
    const profile = selectedProfile(row, chosen);
    const tr = element('tr', 'wine-row' + (chosen.chosen ? ' reviewed-row' : ''));
    tr.addEventListener('click', () => openDetail(i));
    const menuCell = appendCell(tr, 'menu-cell');
    menuCell.append(element('strong', 'menu-name', inputs[i].name));
    const inputMeta = [inputs[i].year, inputs[i].type].filter(v => v !== undefined).join(' · ');
    if (inputMeta) menuCell.append(element('span', 'menu-subline', inputMeta));
    if (row.error) menuCell.append(element('span', 'error-hint', 'Partial upstream error'));

    const matchCell = appendCell(tr, 'match-cell');
    const button = element('button', 'match-button') as HTMLButtonElement;
    button.type = 'button';
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
    const actionCell = appendCell(tr, 'action-cell');
    actionCell.append(element('span', 'row-arrow', '›'));
    resultsBody.append(tr);
  });
}

function addMetadata(parent: HTMLElement, label: string, value: string | number | null | undefined): void {
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
    if (profile.description?.text) {
      info.append(element('h4', 'detail-subheading', 'About this wine'));
      info.append(element('p', 'description', profile.description.text));
      info.append(element('p', 'scope-note', 'Source description is wine-level, not necessarily vintage-specific.'));
    }
    const metadata = element('dl', 'metadata-grid');
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
    const region = [candidate.vintage?.year, candidate.wine.region].filter(Boolean).join(' · ');
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
    resultsBody.querySelectorAll('tr')[lastRowIndex]?.querySelector('button')?.focus();
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
