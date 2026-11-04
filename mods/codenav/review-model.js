// A difference is a contiguous changed block, not every added/removed line.
export function differenceStarts(rows) {
  const stops = [];
  let changed = false;
  for (let i = 0; i < rows.length; i++) {
    const next = rows[i].kind === "+" || rows[i].kind === "-";
    if (next && !changed) stops.push(i);
    changed = next;
  }
  return stops;
}
export function nextDifference(rows, current, direction) {
  const stops = differenceStarts(rows);
  if (!stops.length) return null;
  return direction > 0 ? stops.find(i => i > (current ?? -1)) ?? stops[0]
    : stops.slice().reverse().find(i => i < (current ?? rows.length)) ?? stops[stops.length - 1];
}
