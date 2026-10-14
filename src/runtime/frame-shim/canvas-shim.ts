// natives first: what it takes is read before anything else here runs
import "./natives";
import { guardEdits } from "./edit";
import { announceFileDrags, receiveFileDrops } from "./files";
import { gateAnimationFrames, preserveDrawingBuffers } from "./freeze";
import { relayKeysOut, relayModifierRelease } from "./keys";
import { answerHost } from "./messages";
import { relayMiddlePan } from "./pan";
import { tellPresenceOut } from "./presence";
import { relayWheel } from "./scroll";

/**
 * The canvas shim (#8/#22), a classic script every served frame document
 * carries ahead of any module (`assembleFrameDocument`), so it holds native
 * references before frame code can replace them. Frames keep running when
 * Select owns the pointer; a freeze is the rAF gate (freeze.ts). It speaks the
 * host protocol (messages.ts):
 *
 * {spool:"freeze", on} holds this document's animations while the camera moves
 * (#171) or while nothing has attended the frame for a long minute (#172), and
 * re-delivers every held rAF callback on thaw;
 * {spool:"arrive", settleMs} answers {spool:"arrived"} once this document has
 * finished arriving — the same settle the photo booth waits out before it takes
 * the frame's cover, so a promoted frame's cover fades onto a settled frame (#177);
 * {spool:"capture", id, settleMs} answers with a sanitized foreignObject source
 * for the trusted capture host to rasterize off this frame's main thread, for
 * an export. A frame's cover is never made here: the daemon's photo booth
 * photographs the document itself;
 * {spool:"pick", x, y} answers with the element ancestry at that frame-local
 * point — top-level element down to the deepest, each with its selector,
 * geometry, and nearest data-spool-source stamp (#23) — the canvas walks it
 * Figma-style (double-click descends, Esc ascends) without ever handing the
 * frame the pointer; {spool:"kin", selector, step} answers the same shape for
 * that element's first child or either sibling, which is the keyboard's half
 * of the same ladder (#254); {spool:"edit", selector, x, y} makes that element's
 * own words editable in place and answers {spool:"edit-open"}, then
 * {spool:"edited"} once Enter, Esc or a click away has ended it, carrying the
 * element's child nodes and the call site one owner up (#314), and
 * {spool:"edit-end", commit} ends one from the canvas side (#255);
 * {spool:"alter", id, selectors, act, place, sources} takes the elements out of the
 * document, or puts the first beside the second (#340), and answers
 * {spool:"altered"} with the call one owner up (#317) and, for a move, the
 * moved element's new ancestry. A delete takes out every element its stamps
 * draw, so a component drawn twice loses both; one the file may refuse (drawn
 * more than once, or the whole of a component) answers held and stays until a
 * {spool:"restore", way:"after"} takes it out;
 * {spool:"restore", id, way, ask} puts one committed edit's words or one
 * alteration back or forward and answers {spool:"restored"}, and {spool:"restamp", file, shifts}
 * moves the stamps a save shifted, since the document is not reloaded for its
 * own save;
 * {spool:"sites"} answers with the frame-local boxes of
 * navigation-site elements (#34) so arrows grow out of what causes them.
 * Entered frames also hand canvas-zoom gestures back across
 * the iframe boundary; ordinary wheel input stays inside the frame so its own
 * scroll surfaces remain real.
 *
 * Every listener is on the window, and the order they are added in is the
 * order they hear an event in, so it is kept here in one place.
 */
preserveDrawingBuffers();
gateAnimationFrames();
guardEdits();
answerHost();
relayWheel();
announceFileDrags();
receiveFileDrops();
relayKeysOut();
relayMiddlePan();
tellPresenceOut();
relayModifierRelease();
