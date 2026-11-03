#!/usr/bin/env python3
"""Extracts IntelliJ IDEA's design system from the installed app and the user's
settings into tokens.json and keymap.json beside this file.

  python3 design/idea/extract.py ["/Applications/IntelliJ IDEA.app"]

Theme: the active look and feel (Islands Dark) merged over its parents
(ExperimentalDark, Darcula), named palette colors resolved. Editor: the theme's
editor scheme over its parent. Keymap: "Mac OS X 10.5+" over "$default", with
the user's keymap on top. Fonts and sizes: the user's IDE options.
"""
import argparse, json, os, re, sys, zipfile, glob
import xml.etree.ElementTree as ET  # local IntelliJ files only (no external entities are fetched)

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("app", nargs="?", default="/Applications/IntelliJ IDEA.app")
parser.add_argument("--output-dir", default=os.path.dirname(os.path.abspath(__file__)))
parser.add_argument("--keymap-only", action="store_true", help="Preserve independently maintained tokens.json")
args = parser.parse_args()
APP, OUT = args.app, args.output_dir
os.makedirs(OUT, exist_ok=True)
JAR = f"{APP}/Contents/lib/intellij.platform.ide.impl.jar"
OPTS = sorted(glob.glob(os.path.expanduser("~/Library/Application Support/JetBrains/IntelliJIdea*")))[-1:]
OPTS = OPTS[0] if OPTS else None
z = zipfile.ZipFile(JAR)
names = set(z.namelist())
load = lambda p: json.loads(re.sub(r"(?m)^\s*//.*$", "", z.read(p).decode()))

THEMES = {}
for n in names:
    if n.startswith("themes/") and n.endswith(".theme.json"):
        t = load(n)
        THEMES[t["name"]] = (n, t)
# Themes named by id elsewhere (plugin.xml): the New UI themes.
for alias, name in (("ExperimentalDark", "Dark"), ("ExperimentalLight", "Light")):
    if name in THEMES and alias not in THEMES: THEMES[alias] = THEMES[name]
by_file = {os.path.basename(n): t for n, t in THEMES.values()}


def merged(name):
    """Theme with its parents: palette colors, ui keys (flattened), editor scheme name."""
    chain = []
    while name and name in THEMES:
        chain.append(THEMES[name][1]); name = THEMES[name][1].get("parentTheme")
    colors, ui, scheme = {}, {}, None
    for t in reversed(chain):
        colors.update(t.get("colors", {}))
        flat(t.get("ui", {}), "", ui)
        scheme = t.get("editorScheme", scheme)
    return [t["name"] for t in chain], colors, ui, scheme


def flat(node, prefix, out):
    for k, v in node.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict) and not k.endswith("Insets"):
            flat(v, key, out)
        else:
            out[key] = v


def resolve(v, colors, depth=0):
    if isinstance(v, str) and v in colors and depth < 8:
        return resolve(colors[v], colors, depth + 1)
    return v


laf = "Islands Dark"
if OPTS and os.path.exists(f"{OPTS}/options/laf.xml"):
    m = re.search(r'laf[^>]*themeId="([^"]+)"|<laf[^>]*name="([^"]+)"', open(f"{OPTS}/options/laf.xml").read())
chain, palette, ui, scheme_name = merged(laf)
resolved = {k: resolve(v, palette) for k, v in ui.items()}
colors_ui = {k: v for k, v in resolved.items() if isinstance(v, str) and re.fullmatch(r"#[0-9A-Fa-f]{6,8}", v)}
metrics = {k: v for k, v in resolved.items() if isinstance(v, (int, float)) and not isinstance(v, bool) or (isinstance(v, str) and re.fullmatch(r"\d+(,\s*\d+){1,3}", v))}

# Editor scheme: the theme's scheme file and its parents.
def scheme_files():
    out = {}
    for n in names:
        if n.startswith("themes/") and n.endswith(".xml"):
            root = ET.fromstring(z.read(n))
            if root.tag == "scheme": out[root.get("name")] = root
    return out
SCHEMES = scheme_files()
def scheme(name):
    chain, opts, attrs = [], {}, {}
    while name in SCHEMES:
        chain.append(SCHEMES[name]); name = SCHEMES[name].get("parent_scheme")
    for s in reversed(chain):
        for o in s.findall("./colors/option"): opts[o.get("name")] = "#" + o.get("value") if o.get("value") else ""
        for a in s.findall("./attributes/option"):
            v = {x.get("name"): x.get("value") for x in a.findall("./value/option") if x.get("value") is not None}
            if v: attrs[a.get("name")] = {k: ("#" + c if k.endswith("COLOR") or k in ("FOREGROUND", "BACKGROUND", "EFFECT_COLOR") else c) for k, c in v.items()}
    return [s.get("name") for s in chain], opts, attrs
scheme_chain, editor_colors, editor_attrs = scheme(scheme_name)

# The user's fonts.
fonts = {}
if OPTS:
    for f, keys in (("options/other.xml", ("fontFace", "fontSize")), ("options/editor-font.xml", ("FONT_FAMILY", "FONT_SIZE", "LINE_SPACING"))):
        p = f"{OPTS}/{f}"
        if os.path.exists(p):
            for k in keys:
                m = re.search(rf'name="{k}" value="([^"]*)"', open(p).read())
                if m: fonts[k] = m.group(1)

meta = json.loads(z.read("themes/metadata/IntelliJPlatform.themeMetadata.json"))
descriptions = {u["key"]: u.get("description", "") for u in meta.get("ui", [])}

tokens = {
    "source": {"app": APP, "lookAndFeel": chain, "editorScheme": scheme_chain},
    "fonts": fonts,
    "palette": palette,
    "ui.colors": colors_ui,
    "ui.metrics": metrics,
    "editor.colors": editor_colors,
    "editor.attributes": editor_attrs,
    "descriptions": {k: descriptions[k] for k in list(colors_ui) + list(metrics) if k in descriptions},
}
if not args.keymap_only:
    json.dump(tokens, open(f"{OUT}/tokens.json", "w"), indent=2, ensure_ascii=False)

# Keymap.
BUNDLED_KEYMAPS = set()
def keymap_files():
    out = {}
    for n in names:
        if n.startswith("keymaps/") and n.endswith(".xml"):
            r = ET.fromstring(z.read(n)); out[r.get("name")] = r
            BUNDLED_KEYMAPS.add(r.get("name"))
    if OPTS:
        for p in glob.glob(f"{OPTS}/keymaps/*.xml"):
            r = ET.parse(p).getroot(); out[r.get("name")] = r
            BUNDLED_KEYMAPS.discard(r.get("name"))
    return out
KM = keymap_files()
active = None
if OPTS:
    for p in (f"{OPTS}/options/mac/keymap.xml", f"{OPTS}/options/keymap.xml"):
        if os.path.exists(p):
            m = re.search(r'active_keymap name="([^"]+)"', open(p).read())
            if m: active = m.group(1)
active = active or "Mac OS X 10.5+"
def swap_parent_modifiers(stroke):
    """MacOSDefaultKeymap.mapModifiers: swap Ctrl/Meta, never Alt/Shift.

    Used only on inherited keyboard/mouse shortcuts. IntelliJ leaves modifier
    gestures unchanged (MacOSDefaultKeymap.Companion.convertShortcutFromParent).
    """
    def convert(part):
        words = part.split()
        for i, word in enumerate(words[:-1]):
            modifier = word.lower()
            if modifier not in {"control", "ctrl", "meta", "alt", "shift", "altgraph"}:
                break
            if modifier in {"control", "ctrl", "meta"}:
                words[i] = "control" if modifier == "meta" else "meta"
        # The final key code can itself be CONTROL/META; it is not a modifier.
        return " ".join(words)
    return " , ".join(convert(part) for part in stroke.split(" , "))


def keymap(name, maps=None, visiting=()):
    maps = KM if maps is None else maps
    if name in visiting:
        raise ValueError(f"Cyclic keymap inheritance: {visiting + (name,)}")
    if name not in maps:
        raise ValueError(f"Missing keymap: {name}")
    k = maps[name]
    parent = k.get("parent")
    chain, actions = keymap(parent, maps, visiting + (name,)) if parent else ([], {})
    # Bundled names beginning with Mac OS X use MacOSDefaultKeymap. User
    # schemes are regular KeymapImpl, even if a user chooses a similar name.
    if name in BUNDLED_KEYMAPS and name.startswith("Mac OS X"):
        actions = {id: {**a,
                       "keys": [swap_parent_modifiers(s) for s in a["keys"]],
                       **({"mouse": [swap_parent_modifiers(s) for s in a["mouse"]]} if "mouse" in a else {})}
                   for id, a in actions.items()}
    for a in k.findall("action"):
        ks = [s.get("first-keystroke") + (" , " + s.get("second-keystroke") if s.get("second-keystroke") else "") for s in a.findall("keyboard-shortcut")]
        ms = [s.get("keystroke") for s in a.findall("mouse-shortcut")]
        gestures = [dict(s.attrib) for s in a.findall("keyboard-gesture-shortcut")]
        # A local declaration replaces the whole inherited list, including
        # empty removals; repeated declarations use the last list (Map.put).
        actions[a.get("id")] = {"keys": ks, **({"mouse": ms} if ms else {}),
                                **({"gestures": gestures} if gestures else {})}
    return [name] + chain, actions
km_chain, actions = keymap(active)
json.dump({"keymap": km_chain, "actions": actions}, open(f"{OUT}/keymap.json", "w"), indent=2, ensure_ascii=False)
print(f"theme {chain} scheme {scheme_chain} keymap {km_chain}")
print(f"palette {len(palette)}, ui colors {len(colors_ui)}, metrics {len(metrics)}, editor colors {len(editor_colors)}, attributes {len(editor_attrs)}, actions {len(actions)}")
