// Pure model: defaults remain in the registry; user changes are stable-ID deltas.
// Unknown groups, item metadata and future document fields survive round trips.
const clone = value => JSON.parse(JSON.stringify(value ?? {}));
export function groupItems(id, customization, groups) {
  const base = groups[id]?.items ?? [], patch = customization?.groups?.[id] ?? {};
  const removed = new Set(patch.removed ?? []), seen = new Set();
  let items = [...base.filter(item => !removed.has(item.id)), ...(patch.added ?? [])].filter(item => item?.id && !seen.has(item.id) && seen.add(item.id)).map(item => ({ ...item }));
  for (const placement of patch.placements ?? []) {
    const at = items.findIndex(item => item.id === placement.item);
    if (at < 0) continue;
    const [item] = items.splice(at, 1);
    const anchor = placement.after === null ? -1 : items.findIndex(row => row.id === placement.after);
    if (placement.after === null || anchor >= 0) items.splice(anchor + 1, 0, item);
    else items.push(item); // Removed default anchor: keep user item, with safe fallback.
  }
  return items;
}

export function customizeGroup(customization, id, items, groups) {
  const document = clone(customization), previous = document.groups?.[id] ?? {}, base = groups[id]?.items ?? [];
  const ids = new Set();
  for (const item of items) {
    if (!item?.id || ids.has(item.id)) throw new Error("Duplicate toolbar item ID");
    if (!["action", "widget", "separator"].includes(item.kind) && !groupItems(id, customization, groups).some(existing => JSON.stringify(existing) === JSON.stringify(item))) throw new Error("Unsupported toolbar item");
    ids.add(item.id);
  }
  const defaults = new Set(base.map(item => item.id));
  // A changed default item (for example a custom icon) overrides that occurrence.
  const overrides = items.filter(item => !defaults.has(item.id) || JSON.stringify(item) !== JSON.stringify(base.find(row => row.id === item.id)));
  const overridden = new Set(overrides.map(item => item.id));
  document.schemaVersion ??= 1;
  document.groups = { ...(document.groups ?? {}), [id]: {
    ...previous,
    removed: base.filter(item => !ids.has(item.id) || overridden.has(item.id)).map(item => item.id),
    added: overrides,
    placements: items.map((item, index) => ({ item: item.id, after: index ? items[index - 1].id : null })),
  } };
  return document;
}

export function restoreGroup(customization, id) {
  const document = clone(customization);
  if (document.groups) { document.groups = { ...document.groups }; delete document.groups[id]; }
  return document;
}

export function restoreKnownGroups(customization, groups) {
  let result = clone(customization);
  for (const id of Object.keys(groups)) result = restoreGroup(result, id);
  return result;
}

export function mergeCustomization(original, edited, latest) {
  const result = clone(latest), before = original?.groups ?? {}, after = edited?.groups ?? {};
  result.schemaVersion ??= edited?.schemaVersion ?? 1;
  result.groups = { ...(result.groups ?? {}) };
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[id]) === JSON.stringify(after[id])) continue;
    if (JSON.stringify(before[id]) !== JSON.stringify(latest?.groups?.[id])) throw new Error("Settings changed in another window. Reopen Settings and try again.");
    if (after[id] === undefined) delete result.groups[id]; else result.groups[id] = clone(after[id]);
  }
  return result;
}
