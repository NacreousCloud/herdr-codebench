// The horizontal activity bar: one icon per sidebar view, like VS Code's
// when its activity bar sits on top. Clicking switches the sidebar's stack.
import { div } from "gpui-kit";
import { T } from "./i18n.js";
import { h_flex, v_flex } from "gpui-base";
import { theme, shared, nextCommand } from "herdr";
import { shownViews, activeView, showView, narrow, icon } from "./common.js";

export default class Bar {
  init(_props, cx) {
    // Keys: "activity.view-files" etc. (see keys.json in the repo).
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        const views = shownViews();
        const v = views.find((x) => x.id === c || x.id === `view-${c}`);
        if (v) showView(v.id);
        else if (c === "next" || c === "prev") {
          const i = views.findIndex((x) => x.id === activeView());
          showView(views[(i + (c === "next" ? 1 : views.length - 1)) % views.length].id);
        }
        cx.notify();
      }
    });
  }

  item(v, active, t) {
    const badge = v.id === "view-git" ? shared("activity.git.count") ?? 0 : 0;
    return v_flex().id(`act-${v.id}`).h_full().w(40).flex_none().items_center().justify_center().cursor_pointer()
      .tooltip(T(v.label))
      .text_color(active ? t.foreground : t.dim).hover((s) => s.text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => showView(v.id))
      .child(div().relative().child(icon(v.icon, 18))
        .when(badge > 0, (el) => el.child(div().absolute().top(-6).left(10).min_w(15).h(15).px(3).rounded_full().bg(t.accent)
          .text_color(t.accent_foreground).text_size(9).font_semibold().flex().items_center().justify_center().child(badge > 99 ? "99+" : String(badge)))))
      .child(div().absolute().bottom(0).left(8).w(24).h(2).rounded(1).bg(active ? t.accent : "#00000000"));
  }

  render() {
    const t = theme();
    const active = activeView(), views = shownViews();
    if (narrow()) {
      const v = views.find((x) => x.id === active) ?? views[0];
      return h_flex().size_full().justify_center().bg(t.chrome).border_b(1).border_color(t.border).child(this.item(v, true, t));
    }
    return h_flex().id("activity-bar").size_full().px(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .children(views.map((v) => this.item(v, v.id === active, t)));
  }
}
