// Visual source/diff assembly only. Documents, tokens, diff sides, selection and
// comments stay with their owning views; the same geometry drives hit testing.
import { div, PathBuilder } from "gpui-kit";
import { h_flex } from "gpui-base";
import { IDEA, isIdea, uiColors } from "./idea-design.js";

export function editorGeometry(font, charWidth, { lineCount = 0, numberColumns = 1 } = {}) {
  const numberWidth = Math.max(3, String(lineCount).length) * charWidth;
  const gutterInset = IDEA.editorGutterInset, markerWidth = IDEA.editorMarkerWidth;
  const gutter = gutterInset * 2 + numberWidth * numberColumns + gutterInset * (numberColumns - 1) + markerWidth + 8;
  const textInset = IDEA.editorTextInset;
  return { row: font.row, numberWidth, gutterInset, markerWidth, gutter, textInset, textOrigin: gutter + textInset };
}

export function editorEdgeMark({ kind, start = true, end = true } = {}) {
  const colors = uiColors(), color = { add: colors.lineAdded, mod: colors.lineModified, del: colors.lineDeleted }[kind];
  if (!color) return null;
  const width = IDEA.editorChangeMarkerWidth, radius = IDEA.editorChangeMarkerRadius;
  const mark = div().absolute().right(1).w(width).bg(color);
  if (kind === "del") return mark.bottom(0).h(width).rounded(radius);
  return mark.top(start ? 1 : 0).bottom(end ? 1 : 0).rounded_t(start ? radius : 0).rounded_b(end ? radius : 0);
}

export function editorGutter(geometry, { numbers, rails = [], marker, edgeMark } = {}) {
  return h_flex().w(geometry.gutter).h_full().flex_none().relative().items_center().pl(geometry.gutterInset).pr(geometry.gutterInset)
    .child(h_flex().flex_none().gap(geometry.gutterInset).items_center().children(numbers ?? []))
    .children(rails)
    .child(marker ?? div().w(geometry.markerWidth).flex_none())
    .children(edgeMark ? [editorEdgeMark(edgeMark)].filter(Boolean) : []);
}

export function editorLine(geometry, gutter, content) {
  return h_flex().h(geometry.row).w_full().flex_none().whitespace_nowrap()
    .child(gutter)
    .child(h_flex().pl(geometry.textInset).h_full().items_center().flex_none().children(content));
}

export function editorGuide(gutter, scroll) {
  if (!isIdea()) return null;
  const x = gutter - 1 - scroll.left;
  if (x < 0) return null;
  return div().absolute().left(x).top(0).bottom(0).w(1).bg(uiColors().guide);
}

export function editorViewport(id, { scroll, theme, font, gutter, width, render, onUp }) {
  return div().flex_1().min_h(0).flex().font_family(font.family).text_size(font.size)
    .bg(isIdea() ? uiColors().editor : theme.background)
    .when(isIdea(), el => el.relative().overflow_hidden().text_color(uiColors().foreground))
    // Scroller clamps its horizontal offset before the guide is positioned.
    .child(scroll.view(id, theme, width, render, onUp))
    .children([editorGuide(gutter, scroll)].filter(Boolean));
}

// Native layout radii do not clip child paints. Paint the actual quarter-circle
// cutouts above all children, matching the canvas already owned by islands.js.
export function editorCornerMasks() {
  if (!isIdea()) return [];
  const r = IDEA.islandRadius, k = 0.5522847498307936;
  const left = PathBuilder.fill().move_to(0, 0).line_to(r, 0)
    .cubic_bezier_to(0, r, r * (1 - k), 0, 0, r * (1 - k)).close().build();
  const right = PathBuilder.fill().move_to(r, 0).line_to(0, 0)
    .cubic_bezier_to(r, r, r * k, 0, r, r * (1 - k)).close().build();
  return [window.paint_path(left, uiColors().canvas).absolute().top(0).left(0).size(r),
    window.paint_path(right, uiColors().canvas).absolute().top(0).right(0).size(r)];
}

export function editorSurface(root, { topCorners = false } = {}) {
  if (!isIdea()) return root;
  return root.relative().overflow_hidden().bg(uiColors().editor)
    .children(topCorners ? editorCornerMasks() : []);
}
