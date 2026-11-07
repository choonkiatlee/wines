import { enrichWines, VivinoAlgoliaClient } from '../../../src/index.ts';
import type { CompactWineMatch, WineEnrichmentInput, WineEnrichmentRow } from '../../../src/index.ts';
import './style.css';

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error('Missing element: ' + id);
  return element as T;
}

const form = getElement<HTMLFormElement>('enrich-form');
const input = getElement<HTMLTextAreaElement>('wines-input');
const status = getElement<HTMLParagraphElement>('status');
const resultsBody = getElement<HTMLTableSectionElement>('results-body');
const output = getElement<HTMLElement>('json-output');
const enrichButton = getElement<HTMLButtonElement>('enrich-button');
const connectionButton = getElement<HTMLButtonElement>('connection-button');

function setBusy(busy: boolean): void {
  enrichButton.disabled = busy;
  connectionButton.disabled = busy;
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
    if (row.year !== undefined && (!Number.isInteger(row.year) || (row.year as number) < 1800 || (row.year as number) > 2100)) {
      throw new Error('Years must be four-digit vintage numbers.');
    }
    if (row.type !== undefined && !['red', 'white', 'rose', 'sparkling', 'dessert', 'fortified'].includes(String(row.type))) {
      throw new Error('Unknown wine type.');
    }
  }
  return parsed as WineEnrichmentInput[];
}

function cell(row: HTMLTableRowElement, value: string): HTMLTableCellElement {
  const td = document.createElement('td');
  td.textContent = value;
  row.append(td);
  return td;
}

function showRows(inputs: WineEnrichmentInput[], rows: WineEnrichmentRow<CompactWineMatch>[]): void {
  resultsBody.replaceChildren();
  rows.forEach((item, i) => {
    const name = inputs[i].name + (inputs[i].year ? ' (' + inputs[i].year + ')' : '');
    if (!item.matches.length) {
      const tr = document.createElement('tr');
      cell(tr, name);
      const td = cell(tr, item.error ? 'Upstream unavailable' : 'No plausible candidates');
      td.colSpan = 4;
      resultsBody.append(tr);
      return;
    }
    item.matches.forEach((match, j) => {
      const tr = document.createElement('tr');
      cell(tr, j === 0 ? name : '');
      cell(tr, match.name + (match.year === null ? '' : ' (' + match.year + ')'));
      cell(tr, match.rating
        ? match.rating.score.toFixed(1) + ' · ' + match.rating.scope + ' · ' + (match.rating.count ?? '?') + ' ratings'
        : 'No verified rating');
      cell(tr, match.description ?? '—');
      const linkCell = cell(tr, '');
      if (match.url && /^https:\/\//.test(match.url)) {
        const a = document.createElement('a');
        a.href = match.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'Vivino';
        linkCell.append(a);
      } else linkCell.textContent = '—';
      resultsBody.append(tr);
    });
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const wines = parseInputs();
    status.textContent = 'Searching Vivino Algolia from this browser…';
    setBusy(true);
    const rows = await enrichWines(wines);
    showRows(wines, rows);
    output.textContent = JSON.stringify(rows, null, 2);
    const failures = rows.filter(row => row.error).length;
    status.textContent = failures
      ? failures + ' of ' + rows.length + ' inputs had upstream errors. Check browser network/CORS and try the connection check.'
      : 'Completed ' + rows.length + ' inputs. Candidates are suggestions, not verified identity matches.';
  } catch (error) {
    status.textContent = 'Error: ' + (error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(false);
  }
});

connectionButton.addEventListener('click', async () => {
  status.textContent = 'Checking a direct browser fetch to Algolia…';
  setBusy(true);
  try {
    const { candidates, total } = await new VivinoAlgoliaClient().searchWines('Opus One', 1);
    status.textContent = 'Browser → Algolia succeeded: ' + total + ' indexed hits, first result ' + (candidates[0]?.name ?? 'none') + '.';
  } catch (error) {
    status.textContent = 'Browser → Algolia failed: ' + (error instanceof Error ? error.message : String(error)) + '. Inspect DevTools Network for CORS/preflight details.';
  } finally {
    setBusy(false);
  }
});
