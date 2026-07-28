import { MarkWindow, WalkMark } from "../../../shared/ui/spool-walk-marks";

/**
 * agent-mark--label — the mark rides the frame's name.
 *
 * The label row is the one piece of chrome a frame already has out on the canvas.
 * It floats above the frame, it counter-scales so it is the same size at 12% as at
 * 200%, and it already carries a per-frame verb at its far end: `play` sits there
 * on the selection (`frame-label.tsx:59`). So a second thing can live in it without
 * inventing a surface, and `cart` here is drawn selected on purpose — that is the
 * crowded case, `cart` and the mark and `play` in one 158px row, and it holds.
 *
 * **What it says.** `cart` walks off this page twice and wears a bare, muted mark
 * for it. `cart--empty` declares two walks that go nowhere and wears a chipped one
 * at full strength. `menu` and `receipt` declare only what the arrows already draw
 * and wear nothing at all. The difference you read first is chipped against bare,
 * which survives being small; the terminator inside the glyph — a dashed frame at
 * the far end against a cross — is what you read second, once you have looked.
 *
 * **What it costs.** The name loses width. `cart--empty` is eleven characters and
 * the mark is thirty-nine pixels, so a longer name than that truncates before the
 * mark does, and truncating a frame's own name to make room for a count is a real
 * price. It is the price of the only placement that never collides with anything:
 * the label is above the frame, and every arrow on this canvas leaves and arrives
 * through the frame's edges.
 *
 * **What it does not solve.** A frame this small is a frame you are zoomed out
 * from, and at that zoom the count is a single glyph and a digit. It says that
 * something leaves and how much of it; the names are one press away, which is
 * `agent-mark--open`.
 */
export default function AgentMarkLabelFrame() {
	return <MarkWindow place="label" renderMark={(_frame, walk) => <WalkMark walk={walk} />} />;
}
