// Pure editor history policy. Open tabs, MRU files and back/forward stops are
// different collections; closing a tab must not erase a visited file.
export const fileTabId = spec => `f:${spec.on ?? ""}:${spec.path}`;

function fileSnapshot(tab) {
  const s = tab?.spec;
  if (tab?.type !== "file" || s?.kind !== "file" || typeof s.path !== "string" || !s.path) return null;
  return { id: fileTabId(s), type: "file", spec: {
    kind: "file", path: s.path, root: s.root, rel: s.rel, on: s.on ?? null,
  } };
}

// Old navigation stops contain snapshots, so migration does not need the tab
// to still be open. Never persist edit/dirty state or native editor handles.
export function recentFileTabs(stored = [], stops = [], tabs = []) {
  const seen = new Set(), result = [];
  for (const tab of [...stored, ...stops.slice().reverse(), ...tabs.slice().reverse()]) {
    const snapshot = fileSnapshot(tab);
    if (!snapshot || seen.has(snapshot.id)) continue;
    seen.add(snapshot.id); result.push(snapshot);
    if (result.length === 100) break;
  }
  return result;
}

export function visitFile(stored, tab) {
  const snapshot = fileSnapshot(tab);
  return snapshot ? recentFileTabs([snapshot, ...stored]) : stored;
}

export function tabAfterClose(tabs, active, gone, recentIds = [], preferRecent = false) {
  const rest = tabs.filter(tab => !gone.has(tab.id));
  if (!gone.has(active)) return rest.find(tab => tab.id === active) ?? null;
  if (preferRecent) {
    for (const id of recentIds) {
      const tab = rest.find(tab => tab.id === id);
      if (tab) return tab;
    }
  }
  const at = tabs.findIndex(tab => tab.id === active);
  return rest.find((_tab, i) => i >= at) ?? rest[rest.length - 1] ?? null;
}
