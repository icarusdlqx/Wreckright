/** A card and a field mech share the same additive selection gesture. */
export function selectionAfterClick(selection: readonly number[], id: number, additive: boolean): number[] {
  if (!additive) return [id];
  return selection.includes(id) ? selection.filter((selected) => selected !== id) : [...selection, id];
}
