// A reordered list is accepted only when it holds exactly the current members, each once (M03b): a list built from
// a stale page, or one that slips in another module's lesson, is refused instead of half-applied.
export function isPermutation(current: readonly string[], proposed: readonly string[]): boolean {
  if (current.length !== proposed.length) return false;
  const members = new Set(current);
  const seen = new Set<string>();
  for (const id of proposed) {
    if (!members.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}
