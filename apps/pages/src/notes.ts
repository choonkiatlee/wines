/** Short, faithful excerpt of the source wine description (not invented tasting claims). */
export function shortWineNote(description: string | null | undefined, limit = 132): string | null {
  if (!description || !description.trim()) return null;
  const clean = description.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const prefix = clean.slice(0, limit - 1);
  const wordBoundary = prefix.lastIndexOf(' ');
  const cut = wordBoundary >= Math.floor(limit * 0.65) ? wordBoundary : prefix.length;
  return prefix.slice(0, cut).trimEnd().replace(/[,:;–-]+$/, '') + '…';
}
