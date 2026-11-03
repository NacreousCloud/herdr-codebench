// File and folder icons as VS Code's Material Icon Theme draws them.
// Icons and table: amster93/herdr-file-icons (Apache-2.0), generated from
// material-icon-theme 5.40.0 (MIT); see the LICENSE files here. The matching is
// theirs: path rule, then name (folders also without a leading . _ - or __x__),
// then the longest extension first.
import { image } from "gpui-kit";
import { settings, shared } from "herdr";
import { ideaImage } from "./idea.js";
import ICONS from "./table.js";

const DIR = "mods/activity/ficons/svg";
const bare = (name) => name.replace(/^__(.+)__$/, "$1").replace(/^[._-]/, "");
const opened = (id) => id.endsWith("_light") ? `${id.slice(0, -6)}-open_light` : `${id}-open`;
const lookup = (table, key, dark) => (dark ? undefined : ICONS.light[table][key]) ?? ICONS[table][key];

/** The icon (a path for image()) of `path` (relative, "/"-separated). */
export function fileIcon(path, dir = false, open = false, dark = true) {
  const parts = path.toLowerCase().split("/"), name = parts[parts.length - 1];
  const table = dir ? "folderNames" : "fileNames";
  const find = (key) => lookup(table, key, dark) ?? (dir ? lookup(table, bare(key), dark) : undefined);
  let id;
  for (let i = 0; !id && i < parts.length - 1; i++) id = find(parts.slice(i).join("/"));
  if (dir) {
    id ??= find(name) ?? ICONS.folder;
    return `${DIR}/${open ? opened(id) : id}.svg`;
  }
  id ??= lookup(table, name, dark);
  for (let dot = name.indexOf("."); !id && dot !== -1; dot = name.indexOf(".", dot + 1)) id = lookup("fileExtensions", name.slice(dot + 1), dark);
  return `${DIR}/${id ?? ICONS.file}.svg`;
}

/** The icon of `path` as an element, for the current theme (light themes get the _light variants). */
// The idea layout draws IntelliJ's icons instead (idea.js).
export const fileImage = (path, dir = false, open = false, size = 16) => shared("layout") === "idea" ? ideaImage(path, dir, size)
  : image(fileIcon(path, dir, open, settings()?.dark !== false)).size(size).flex_none();
