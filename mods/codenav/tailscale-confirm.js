import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, notify, run, theme } from "herdr";
import { button } from "./common.js";

export default class TailscaleConfirm extends View {
  init(p, cx) {
    this.token = p?.token ?? "";
    this.overlay = p?.overlay;
    this.done = false;
    this.focus = cx.focus_handle();
    this.focus.focus();
    cx.timer.after(60_000, () => this.expire());
  }

  finish(command) {
    if (this.done) return;
    this.done = true;
    run(`codenav.${command}:${this.token}`);
    closeOverlay(this.overlay);
  }

  confirm() { this.finish("tailscale-down"); }
  cancel() { this.finish("tailscale-cancel"); }

  expire() {
    if (this.done) return;
    this.cancel();
    notify({ title: "Tailscale confirmation expired", body: "Tailscale remains connected.", level: "info" });
  }

  render() {
    const t = theme();
    return v_flex().id("tailscale-confirm").size_full().min_h(0).p(18).gap(12).bg(t.popover).text_size(13)
      .track_focus(this.focus)
      .on_key_down((e, cx) => {
        if (e.key === "escape") this.cancel();
        else if (e.key === "enter") this.confirm();
        else return;
        cx.stop_propagation();
      })
      .child(h_flex().items_center()
        .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Disconnect Tailscale?"))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(div().flex_1().min_h(0).text_color(t.muted)
        .child("Disconnecting can immediately interrupt active Herdr and SSH sessions on this Mac."))
      .child(h_flex().justify_end().gap(8)
        .child(button("tailscale-cancel", "Cancel", () => this.cancel()))
        .child(button("tailscale-confirm-down", "Disconnect", () => this.confirm(), { solid: true })));
  }
}
