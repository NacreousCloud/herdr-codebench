// A list that scrolls itself and draws only the items on screen, as plain
// elements: unlike a virtual list's rows they can take presses, drags and
// releases (text selection, comments over a range). Used by the code view and
// the review's diff.
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";

export class Scroller {
  constructor() { this.top = 0; this.viewH = 0; this.tops = [0]; }

  // Every item's height, in order (px).
  setHeights(heights) {
    const tops = [0];
    for (const h of heights) tops.push(tops[tops.length - 1] + h);
    this.tops = tops;
    this.setTop(this.top);
  }
  total() { return this.tops[this.tops.length - 1]; }
  maxTop() { return Math.max(0, this.total() - this.viewH); }
  setTop(px) { this.top = Math.min(Math.max(px, 0), this.maxTop()); }
  page(dir) { this.setTop(this.top + dir * Math.max(this.viewH - 40, 20)); }

  // "center" puts item k in the middle; otherwise it is only brought on screen.
  scrollTo(k, how) {
    const y = this.tops[k] ?? 0, h = (this.tops[k + 1] ?? y) - y;
    if (how === "center") this.setTop(y - this.viewH / 2 + h / 2);
    else if (y < this.top) this.setTop(y);
    else if (y + h > this.top + this.viewH) this.setTop(y + h - this.viewH);
  }

  // The scrolling box: render(k) for the items on screen, the wheel, a scrollbar.
  // onUp(cx) runs on any release inside, so a drag that ends off its rows ends too.
  view(id, t, width, render, onUp) {
    const tops = this.tops, n = tops.length - 1;
    this.setTop(this.top);
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tops[mid + 1] <= this.top) lo = mid + 1; else hi = mid; }
    const out = [];
    for (let k = lo; k < n && tops[k] < this.top + this.viewH; k++) out.push(render(k));
    return div().id(id).flex_1().min_h(0).relative()
      .on_size_change((size, cx) => { if (size.height !== this.viewH) { this.viewH = size.height; this.setTop(this.top); cx.notify(); } })
      .on_mouse_move((e, cx) => { if (this.grab === undefined) return; this.dragThumb(e.local_position?.y ?? 0); cx.notify(); })
      .on_mouse_up("left", (_e, cx) => { this.grab = undefined; onUp?.(cx); })
      .child(div().id(`${id}-x`).size_full().overflow_x_scrollbar()
        .child(div().id(`${id}-wide`).relative().overflow_hidden().min_w(width).w_full().h_full()
          // Vertical wheel here; sideways goes on to the horizontal scroll.
          .on_scroll_wheel((e, cx) => {
            if (Math.abs(e.delta.y) <= Math.abs(e.delta.x)) return;
            cx.stop_propagation();
            this.setTop(this.top - e.delta.y);
            cx.notify();
          })
          .child(v_flex().absolute().left(0).w_full().top((tops[lo] ?? 0) - this.top).children(out))))
      .child(this.scrollbar(id, t));
  }

  scrollbar(id, t) {
    const total = this.total(), h = this.viewH;
    if (!h || total <= h) return div();
    const size = Math.max(24, (h * h) / total), y = (this.top / this.maxTop()) * (h - size);
    this.thumb = { y, size };
    return div().id(`${id}-sb`).absolute().top(0).right(0).w(10).h_full()
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        const ly = e.local_position?.y ?? 0;
        this.grab = ly >= y && ly <= y + size ? ly - y : size / 2;
        this.dragThumb(ly);
        cx.notify();
      })
      .child(div().absolute().top(y).right(2).w(6).h(size).rounded(3).bg(t.dim + "88"));
  }
  dragThumb(ly) {
    const room = this.viewH - this.thumb.size;
    if (room > 0) this.setTop(((ly - this.grab) / room) * this.maxTop());
  }
}
