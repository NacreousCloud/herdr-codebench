// Source affordances locate a request; the LSP supplies navigation targets.
export const documentIdentity = (spec, space) => spec?.path
  ? JSON.stringify([space ?? null, spec.on ?? null, spec.kind ?? "file", spec.path]) : null;
export const sameDocument = (a, aSpace, b, bSpace) => documentIdentity(a, aSpace) !== null
  && documentIdentity(a, aSpace) === documentIdentity(b, bSpace);

export function definitionGesture(modifiers, idea) {
  if (modifiers?.platform) return idea && modifiers.alt ? "implementation" : "definition";
  return !idea && modifiers?.control ? "definition" : null;
}

export function navigationMarkers(lines, path) {
  if (!/\.(kt|kts|java)$/.test(path ?? "")) return [];
  // Spring syntax/indexing is owned by the Go engine, so JavaScript never
  // invents an injection marker just because another class has @Service.
  const markers = [];
  let owner = null;
  let javaOverride = false;
  lines.forEach((text, line) => {
    const declaration = /\b(?:class|object|enum\s+class)\s+(\w+)/.exec(text);
    if (declaration) owner = { line, col: text.indexOf(declaration[1]), name: declaration[1] };
    const override = /\boverride\s+(?:(?:public|protected|suspend|abstract)\s+)*(?:fun|val|var)\s+(\w+)/.exec(text);
    if (override && owner) markers.push({ kind: "super", line, col: text.indexOf(override[1]), name: override[1], owner, title: "Go to Super Declaration" });
    if (/@Override\b/.test(text)) javaOverride = true;
    const method = /\b(?:public|protected)\s+(?:(?:final|synchronized)\s+)?[\w.<>\[\]]+\s+(\w+)\s*\(/.exec(text);
    if (javaOverride && method && owner) { markers.push({ kind: "super", line, col: text.indexOf(method[1]), name: method[1], owner, title: "Go to Super Declaration" }); javaOverride = false; }
  });
  return markers;
}
