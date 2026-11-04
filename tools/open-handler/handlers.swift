// Default "open with" apps by file extension.
//   swift handlers.swift set <bundle id> <backup.json> <ext>...   (keeps the old apps in backup.json)
//   swift handlers.swift restore <backup.json>
//   swift handlers.swift show <ext>...
// Uses NSWorkspace: LSSetDefaultRoleHandlerForContentType reports success on
// recent macOS but the change doesn't persist.
import AppKit
import Foundation
import UniformTypeIdentifiers

let ws = NSWorkspace.shared
func type(_ ext: String) -> UTType? { UTType(filenameExtension: ext) }
func current(_ t: UTType) -> String? {
  ws.urlForApplication(toOpen: t).flatMap { Bundle(url: $0)?.bundleIdentifier }
}
func assign(_ t: UTType, _ bundle: String) -> String? {
  guard let app = ws.urlForApplication(withBundleIdentifier: bundle) else { return "no app \(bundle)" }
  var result: String? = "timed out"
  var done = false
  ws.setDefaultApplication(at: app, toOpen: t) { err in result = err.map { "\($0.localizedDescription)" }; done = true }
  let until = Date() + 10
  while !done && Date() < until { RunLoop.main.run(until: Date() + 0.05) }
  return result
}
func load(_ path: String) -> [String: String] {
  guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)) else { return [:] }
  return (try? JSONSerialization.jsonObject(with: data)) as? [String: String] ?? [:]
}

var args = Array(CommandLine.arguments.dropFirst())
let mode = args.isEmpty ? "" : args.removeFirst()
switch mode {
case "set":
  let bundle = args.removeFirst(), backupPath = args.removeFirst()
  var backup = load(backupPath)
  for ext in args {
    guard let t = type(ext) else { print("\(ext): no type"); continue }
    let old = current(t) ?? ""
    if backup[t.identifier] == nil && old.lowercased() != bundle.lowercased() { backup[t.identifier] = old }
    let err = assign(t, bundle)
    print("\(ext) (\(t.identifier)): \(old.isEmpty ? "-" : old) -> \(err == nil ? bundle : "FAILED: \(err!)")")
  }
  let out = try! JSONSerialization.data(withJSONObject: backup, options: [.prettyPrinted, .sortedKeys])
  try! out.write(to: URL(fileURLWithPath: backupPath))
case "restore":
  for (id, old) in load(args[0]).sorted(by: { $0.0 < $1.0 }) {
    let to = old.isEmpty ? "com.apple.TextEdit" : old
    let err = assign(UTType(id) ?? UTType(importedAs: id), to)
    print("\(id) -> \(err == nil ? to : "FAILED: \(err!)")")
  }
case "show":
  for ext in args {
    guard let t = type(ext) else { print("\(ext): no type"); continue }
    print("\(ext) (\(t.identifier)): \(current(t) ?? "-")")
  }
default:
  print("usage: set <bundle> <backup.json> <ext>... | restore <backup.json> | show <ext>...")
}
