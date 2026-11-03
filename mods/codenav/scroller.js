// A list that scrolls itself, both ways, and draws only the items on screen,
// as plain elements: unlike a virtual list's rows they can take presses, drags
// and releases (text selection, comments over a range). Used by the code view
// and the review's diff.
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";

const BAR = 10;

export class Scroller {
  constructor() { this.top = 0; this.left = 0; this.viewH = 0; this.viewW = 0; this.width = 0; this.tops = [0]; }

  // Every item's height, in order (px).
  setHeights(heights) {
    const tops = [0];
    for (const h of heights) tops.push(tops[tops.length - 1] + h);
    this.tops = tops;
    this.setTop(this.top);
  }
  total() { return this.tops[this.tops.length - 1]; }
  maxTop() { return Math.max(0, this.total() - this.viewH); }
  maxLeft() { return Math.max(0, this.width - this.viewW); }
  // A position that isn't a number (a missing wheel delta) counts as the start.
  setTop(px) { this.top = Math.min(Math.max(Number(px) || 0, 0), this.maxTop()); }
  setLeft(px) { this.left = Math.min(Math.max(Number(px) || 0, 0), this.maxLeft()); }
  page(dir) { this.setTop(this.top + dir * Math.max(this.viewH - 40, 20)); }

  // "center" puts item k in the middle; otherwise it is only brought on screen.
  scrollTo(k, how) {
    const y = this.tops[k] ?? 0, h = (this.tops[k + 1] ?? y) - y;
    if (how === "center") this.setTop(y - this.viewH / 2 + h / 2);
    else if (y < this.top) this.setTop(y);
    else if (y + h > this.top + this.viewH) this.setTop(y + h - this.viewH);
  }

  // The scrolling box: render(k) for the items on screen, `width` wide; the wheel
  // (Shift turns it sideways) and both scrollbars. onUp(cx) runs on any release
  // inside, so a drag that ends off its rows ends too.
  view(id, t, width, render, onUp) {
    this.width = width;
    const tops = this.tops, n = tops.length - 1;
    this.setTop(this.top); this.setLeft(this.left);
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tops[mid + 1] <= this.top) lo = mid + 1; else hi = mid; }
    const out = [];
    // Before the first layout reports a size, a screenful anyway (the box has no height of its own).
    const viewH = this.viewH || 1200;
    for (let k = lo; k < n && tops[k] < this.top + viewH; k++) out.push(render(k));
    return div().id(id).flex_1().h_full().min_h(0).min_w(0).relative().overflow_hidden()
      .on_size_change((size, cx) => {
        if (size.height === this.viewH && size.width === this.viewW) return;
        this.viewH = size.height; this.viewW = size.width;
        this.setTop(this.top); this.setLeft(this.left);
        cx.notify();
      })
      .on_scroll_wheel((e, cx) => {
        // macOS already turns Shift+wheel sideways; a device that doesn't sends it as y.
        const shift = e.modifiers?.shift, x = Number(e.delta?.x) || 0, y = Number(e.delta?.y) || 0;
        const dx = shift && !x ? y : x, dy = shift ? 0 : y;
        cx.stop_propagation();
        this.setTop(this.top - dy); this.setLeft(this.left - dx);
        cx.notify();
      })
      .on_mouse_move((e, cx) => {
        if (!this.grab) return;
        this.dragThumb(this.grab.axis === "y" ? e.local_position?.y ?? 0 : e.local_position?.x ?? 0);
        cx.notify();
      })
      .on_mouse_up("left", (_e, cx) => { this.grab = null; onUp?.(cx); })
      .child(v_flex().absolute().left(-this.left).top((tops[lo] ?? 0) - this.top).w(Math.max(width, this.viewW)).children(out))
      .child(this.bar(id, t, "y"))
      .child(this.bar(id, t, "x"));
  }

  // A scrollbar along y (right edge) or x (bottom edge); press to jump, drag the thumb.
  bar(id, t, axis) {
    const y = axis === "y", view = y ? this.viewH : this.viewW, total = y ? this.total() : this.width;
    if (!view || total <= view) return div();
    const size = Math.max(24, (view * view) / total), max = y ? this.maxTop() : this.maxLeft();
    const at = ((y ? this.top : this.left) / max) * (view - size);
    this.thumbs = { ...this.thumbs, [axis]: size };
    const track = div().id(`${id}-${axis}`).absolute()
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        const p = (y ? e.local_position?.y : e.local_position?.x) ?? 0;
        this.grab = { axis, offset: p >= at && p <= at + size ? p - at : size / 2 };
        this.dragThumb(p);
        cx.notify();
      });
    return y
      ? track.top(0).right(0).w(BAR).h_full().child(div().absolute().top(at).right(2).w(6).h(size).rounded(3).bg(t.dim + "88"))
      : track.left(0).bottom(0).h(BAR).w_full().child(div().absolute().left(at).bottom(2).h(6).w(size).rounded(3).bg(t.dim + "88"));
  }
  dragThumb(p) {
    const { axis, offset } = this.grab, y = axis === "y";
    const room = (y ? this.viewH : this.viewW) - this.thumbs[axis];
    if (room <= 0) return;
    const to = ((p - offset) / room) * (y ? this.maxTop() : this.maxLeft());
    if (y) this.setTop(to); else this.setLeft(to);
  }
}
