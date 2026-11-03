# T07 — Installed IntelliJ artifact audit

Date: 2026-11-03 KST. Scope: read-only static inspection of the explicitly selected installed IntelliJ IDEA package, supporting the `idea-ux` parity plan. No application interaction, target execution, configuration change, installation, process control, source modification, commit, or push. Only this report was written.

## Identity and method

The root investigator already opened `intellij.platform.ide.impl.jar` in REA. Its subsequent `inspect_artifact` inventory returned `integrity_mismatch` (“Root artifact changed during inventory”). I did not open, close, reset, or otherwise alter that shared session. A direct Python `hashlib.file_digest` check of the same JAR returned the exact root-provided SHA-256, so the static evidence below is independently bound to those bytes. This does **not** explain or clear the REA inventory failure; no successful REA inventory or Evidence ID is claimed here.

Read the `reverse-engineer-anything` skill and relevant native/artifact guide. Used Python `zipfile` to read exact JAR members and `/usr/bin/javap -p -c -classpath <jar> <class>` for bytecode, without loading or executing target classes. The bundled JBR has no `javap` binary at the initially considered location; the existing system `javap` worked. No tool installation occurred. Inspected existing `design/idea/extract.py` and `DESIGN.md` without running the extractor, because it writes token/keymap files.

Root's separate actual UI inspection established Islands Dark, UI scale 100%, system UI font size 13, Compact mode checked, and project toolbar color checked. These are root-reported runtime observations, not observations independently made in this static audit.

## Answered: compact value precedence

Resource parent chain:

1. `themes/islands/ManyIslandsDark.theme.json`: name `Islands Dark`, parent `ExperimentalDark`.
2. `themes/expUI/expUI_dark.theme.json`: name `Dark` (alias ExperimentalDark), parent `Darcula`.
3. `themes/darcula.theme.json`: name `Darcula`.

`com.intellij.ide.ui.laf.LafManagerImplKt.applyDensityOnUpdateUi(UIDefaults)` checks `UISettings.getUiDensity() == UIDensity.COMPACT` at bytecode offsets 93–97. It collects compact entries into a map (100–120), then `UIDefaults.putAll` (123–126). Its `applyDensityOnUpdateUi$lambda$0` checks string keys ending `.compact` (19–25), removes the suffix (50–56), and places the value under the base key (59–60).

**Conclusion:** after normal theme inheritance, compact suffix entries overwrite the corresponding base entries. Keeping normal and compact tokens side by side without selecting density is insufficient. An inherited Darcula compact entry can override an Islands non-compact entry.

## Answered: compact metrics in packaged resources

All values below are logical UI units before JBUI scaling, not guaranteed captured screen bounds. `I` = Islands member, `D` = Darcula member above.

| Key | Normal resource value | Effective compact resource value | Source |
| --- | --- | --- | --- |
| `Island.arc` | 20 | **16** | I `.compact` |
| `Island.borderWidth` | 6 | **4** | I `.compact` |
| `Island.borderArcLength` | 14 | **10** | I `.compact` |
| `Component.arc` | 8 | **6** | I `.compact` |
| `Button.arc` | 8 | **8** (no compact override found in the three theme resources) | I |
| `Banner.arc` | 12 | **8** | I `.compact` |
| `List.rowHeight`, `Tree.rowHeight` | 24 | **22** | I `.compact` |
| `Table.rowHeight`, `TableHeader.height` | 20, 25 | **20, 25** (no compact override in these resources) | D |
| `TabbedPane.tabHeight` | 40 | **36** | D `.compact` |
| `EditorTabs.underlineHeight` | 4 | **3** | D `.compact` |
| `EditorTabs.underlineArc` | 4 | **4** | I |
| `EditorTabs.tabInsets` | not asserted | **-2,6,-2,4** | I `.compact` |
| `EditorTabs.verticalTabInsets` | not asserted | **-2,10,-2,10** | I `.compact` |
| `ToolWindow.Header.height` | not asserted | **31** | D `.compact` |
| `ToolWindow.Header.font.size.offset` | 0 | 0 | I |
| `ToolWindow.Header.fontSizeOffset` | not asserted | **-1** | D `.compact`; distinct key from previous row |
| `StripeToolbar.Button.size` | 37,40 | **32,32** | D `.compact` |
| `StripeToolbar.Button.iconSize` | not asserted | **16** | D `.compact` |
| `MainToolbar.Button.size` | not asserted | **26,26** | D `.compact` |
| `MainToolbar.Button.iconSize` | not asserted | **16** | D `.compact` |
| `MainToolbar.Button.arc` | fallback 12 in JBUI getter | **8** | I `.compact` |
| `MainToolbar.Icon.insets` | 6,5,4,5 | **3,4,3,4** | D `.compact` |
| `RunWidget.toolbarHeight`, `RunWidget.actionButtonWidth` | not asserted | **26, 26** | D `.compact` |
| `Button.minimumSize` | not asserted | **72,24** | I `.compact` |
| `ComboBox.minimumSize`, `TextField.minimumSize` | not asserted | **49,24** | I `.compact` |
| `ComboBox.arc` | not asserted | **4,4,4,4** | I `.compact`; four-value type, do not treat as Component.arc |
| `ComboBox.padding` | not asserted | **1,6,1,6** | I `.compact` |
| `TitlePane.Button.preferredSize` | not asserted | **40,30** | I `.compact` |

`ToolWindow.Header.font.size.offset` and `ToolWindow.Header.fontSizeOffset` are literally distinct packaged keys. Their final font consumption was not traced; do not silently collapse them.

## Answered: Island arc and border semantics

`com.intellij.openapi.application.impl.islands.IslandsUICustomization.paintIslandAreaRaw(JComponent, Graphics2D)`:

- offsets 36–44: read `JBUI.getInt("Island.arc", 20)` into local 6.
- offsets 87–108: read `JBUI.getInt("Island.borderWidth", 6)`, integer divide by **2**, `JBUI.scale`, align to the display grid; local 7.
- offsets 143–151: convert arc to float, divide by **2**, then `JBUIScale.scale`; local 13.
- offsets 161–214: paint the outer top/bottom/left/right strips in the main background with local-7 thickness.
- offsets 254–327: top-left corner mask starts at `(inset,inset)`, draws to `(radius+inset,inset)`, then `quadTo(inset,inset,inset,radius+inset)` and fills the shape. Other corners mirror this. This is a **quadratic Bézier corner**, not proof of an exact circular CSS border-radius profile.

**Conclusion:** in compact mode at 100% user scale, the main filled corner span uses **8 logical units** (`arc 16 / 2`); each island paints a **2-unit outer strip** (`borderWidth 4 / 2`). Normal mode uses corner span 10 and strip 3. Treating `Island.arc` itself as radius doubles the intended corner span. Treating `Island.borderWidth` as a per-island 4-unit inset doubles the strip.

For two touching component allocations whose masks abut, 2 + 2 yields a 4-unit visible surface gap; this is a geometric inference, not a measurement of every split. Pane placement, split divider allocation, outer margins, and device alignment can change final bounds. The top-left content boundary begins at the inset (2) and extends through the corner span; global island allocation and internal content rectangle are distinct.

The separate border outline uses `Island.borderArcLength` near offset 663. It must not be substituted for the filled corner span. Full border-outline activation and all divider paths were outside this narrow trace.

## Answered: Islands tab shape, partially answered: editor bar size

`IslandsTabPainter.paintTab(Graphics2D, JBTabsPosition, Rectangle, Color, boolean, boolean, boolean)` reads `UISettings.getCompactMode()` directly (27–35).

- Compact: total minimum vertical slack **4**, target filled tab height **24** (54–104).
- Normal: slack **8** for horizontal tabs / **6** for side tabs; target fill height **28**.
- It calculates `slack = max(rect.height - targetHeight, minimumSlack)` (107–120), `fillY = floor(rect.y + slack / 2)` (132–147), and `fillHeight = rect.height - slack` (163–171). Thus compact fill height is `min(24, rect.height - 4)`, not unconditional 24.
- It obtains the fill arc through `JBUI.CurrentTheme.MainToolbar.Button.hoverArc()` (18–25). That getter reads `MainToolbar.Button.arc`, fallback 12; compact theme value is **8**.
- `IslandsTabPainter$Companion.getHOffsetUnscaled...` returns **2** for horizontal compact tabs, **4** for normal horizontal tabs, **6** for side tabs. `firstTabOffset` is initialized to `JBUI.scale(3)`.
- Filled rounded rectangles go through `RectanglePainter2D.FILL.paint` (213–230). `RectanglePainter2D$2.paint(..., Double, StrokeType, double, Object)` passes the arc into `RoundRectangle2D.Double` width/height arc arguments (149–177, plus stroke correction). For the inside fill branch correction is zero (100–109). Thus tab arc **8 is an arc diameter**, equivalent circular radius **4**, unlike Island's explicit quadratic corner mask.

`IslandsTabPainterAdapter.paintBackground` sets `firstTabOffset`, then invokes the Islands painter. `IslandsTabPainter` constructor chooses `IslandsTabTheme` for editor mode and stores selected colors from `EditorTabs.underlinedTabBackground` / `EditorTabs.underlinedBorderColor`.

**Do not call `TabbedPane.tabHeight=36` an established editor-tab-bar height.** It is a real compact token consumed by `JBUI.CurrentTheme.TabbedPane.TAB_HEIGHT`, but this audit has not traced the complete editor `JBTabsImpl` layout height calculation. The Islands fill's 24-unit size is a more direct shape fact, while the actual editor bar bounds still need screenshot measurement or further layout-bytecode tracing. Likewise, inherited underline-height 3 is a real resolved default; this does not establish that the Islands painter renders the old editor underline in the visible state.

## Existing extraction limitations and plan implications

`design/idea/extract.py` preserves `.compact` entries but does not apply density selection. It also sets `laf = "Islands Dark"` literally; it parses `laf.xml` into `m` without using that result to select `laf`. Its font extraction covers configured fields, not runtime font metrics or control minimums. Existing `DESIGN.md` section 7 describes normal Island radius10 / gap6, compact stripe32, and editor tab bar38, which mixes density assumptions.

Plan corrections supported by this audit:

1. Establish compact density centrally from actual checked settings; use compact overrides **after** parent-theme merge.
2. Use Island corner span8 and touching-strip gap4 as baseline candidates at UI100%, retaining quadratic-mask versus circular-radius distinction for close screenshots.
3. Use row22, stripe32, toolbar button26, header31, control min-height24 as initial constraints, then verify their rendered bounds rather than equating every resource metric to allocation height.
4. Keep editor bar height unresolved until measured; use exact Islands selected-fill algorithm and arc diameter8/radius4 for its visual shape.
5. Project-color toolbar checked can add a gradient; a single solid `MainToolbar.background` resource is not sufficient proof of actual toolbar pixels. Gradient activation/color selection was not traced here.

## Remaining unknowns / bounded coverage

- No live UI defaults dump, pixel capture, Java agent attach, or target method execution.
- No claim that every row renderer obeys Tree/List rowHeight22; per-widget overrides are possible.
- Main toolbar overall allocation height, macOS traffic-light/header layout, editor tab bar height, status-bar allocation and split divider widths remain unproven by these resource keys alone.
- Component/Button arc resource values are confirmed, but generic control painter geometry was not fully followed; only Island and Islands-tab diameter semantics are established here.
- The REA integrity mismatch remains unexplained despite matching direct SHA-256 before/after focused reads. REA lifecycle stayed owned by root.

## SHA-256 evidence ledger

- `/Applications/IntelliJ IDEA.app/Contents/lib/intellij.platform.ide.impl.jar`: `5a19d56e6ff99866f413af64200954a2e61c6dc8258014de0811a08e4312e026`
  - `themes/islands/ManyIslandsDark.theme.json`: `abd8856484b7b8fc1bcf48206c5cf7582559920d7f85885959ff4d04b8adef38`
  - `themes/expUI/expUI_dark.theme.json`: `1e41f0c62c1ebf49f75cdd10182a48c100f74b443ecc53ed642458e2e58d81ee`
  - `themes/darcula.theme.json`: `858efbd6afdb12f26b4757c4ff7b1bccb8bdefc286797fa6344769496b6c59cb`
  - `com/intellij/ide/ui/laf/LafManagerImplKt.class`: `e922ed360250c0f9eecb02287ce65148643f7fdd797155f60d6524f274e50913`
  - `com/intellij/openapi/application/impl/islands/IslandsUICustomization.class`: `531d7b5bfc096401ed93c1505469da7eb85878deac3398df80b2378f61de70d4`
  - `com/intellij/openapi/application/impl/islands/IslandsTabPainter.class`: `c62a3543bf21dba0a0534e5e4cb99e6beb10f073f4d9ddf4817f452496b76630`
  - `com/intellij/openapi/application/impl/islands/IslandsTabPainter$Companion.class`: `991900163d6fa3a9ac942329c0520783f55b281753dd1553b33f01287fa62d9b`
- `/Applications/IntelliJ IDEA.app/Contents/lib/intellij.platform.util.ui.jar`: `e4dcc28e56407373c32d5262388d1fcc5e90a12b42eee7a1e9cd43f7b33dfac6`
  - `com/intellij/util/ui/JBUI$CurrentTheme$MainToolbar$Button.class`: `6c67906ae70c986c3501c43c8c38eb40b84c53ebd36f9c1213df44544a3436d4`
  - `com/intellij/util/ui/JBUI$CurrentTheme$ToolWindow.class`: `9096bff4ffad5956b2faa7eef6f2eaba6807fdc2a6a2d13f4ded0251a15b7f7e`
  - `com/intellij/util/ui/JBUI$CurrentTheme$TabbedPane.class`: `548e3d198da2181d36fc95ba833f5ff24349c522fc8187f625d50adfacd31edf`
  - `com/intellij/ui/paint/RectanglePainter2D$2.class`: `b34e0757588d5373161ba581613599f2555cb18af8faebfcf8e0790d601b29e8`
