// Diagnostics use zero-based LSP coordinates; exported text uses editor coordinates.
const coordinate = value => Number.isInteger(value) && value >= 0 ? String(value + 1) : "?";

export function diagnosticKey(entry) {
  const d = entry.diagnostic;
  return JSON.stringify([entry.on ?? null, entry.path, d.line, d.col, d.end_line,
    d.end_col, d.severity, d.source, d.code, d.message]);
}

export function diagnosticText(entries) {
  return entries.map(entry => {
    const d = entry.diagnostic;
    const start = `${coordinate(d.line)}:${coordinate(d.col)}`;
    const end = d.end_line == null && d.end_col == null ? "" : `–${coordinate(d.end_line)}:${coordinate(d.end_col)}`;
    const context = [
      `Machine: ${entry.on ?? "local"}`,
      `Path: ${entry.path}`,
      ...(entry.root != null ? [`Root: ${entry.root}`] : []),
      `Location: ${start}${end}`,
      `Severity: ${d.severity ?? "unknown"}`,
      ...(d.source != null ? [`Source: ${d.source}`] : []),
      ...(d.code != null ? [`Code: ${typeof d.code === "object" ? JSON.stringify(d.code) : d.code}`] : []),
    ];
    return `${context.join("\n")}\nMessage:\n${d.message ?? ""}`;
  }).join("\n\n");
}
