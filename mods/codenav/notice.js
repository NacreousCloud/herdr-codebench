import { div } from "gpui-kit";
import { props, closeOverlay, run } from "herdr";
import { uiNoticeCard, uiIconButton, uiColors } from "./idea-design.js";
import { icon } from "./common.js";

export default class Notice {
  init(p, cx) { this.note = p.note; cx.timer.after(Math.max(2000, Number(p.note.timeout) || 8000), () => closeOverlay(props().overlay)); }
  render() {
    const note = this.note, c = uiColors();
    return uiNoticeCard("idea-notice-balloon", note, {
      graphic: div().mt(2).size(15).rounded_full().bg(note.level === "error" ? c.error : "#6587F5").text_color("#FFFFFF").flex().items_center().justify_center().child(note.level === "error" ? "!" : "i"),
      trailing: uiIconButton("idea-notice-close", icon("x", 12), () => closeOverlay(props().overlay), { size: 18 }),
      onClick: () => { if (note.action?.name) run(note.action.name, note.action.args ?? {}); closeOverlay(props().overlay); },
    }).size_full().border_1().border_color(c.border).on_mouse_down("left", (_event, cx) => cx.stop_propagation());
  }
}
