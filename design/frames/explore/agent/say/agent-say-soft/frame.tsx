import { StreamStage } from "shared/ui/explore/agent/stream-stage";

/**
 * agent-say-soft: the pen with a 36px feather, and no caret.
 *
 * The same mask, but the edge is a gradient about five characters wide instead of a
 * cut. The last few glyphs are always coming up as the edge passes over them, so the
 * motion is continuous rather than a glyph at a time, and there is nothing to add for
 * liveness: the soft edge is what says more is coming.
 *
 * The old argument against a soft edge was that it freezes when the pace stalls, and a
 * half-visible word sitting still reads as a rendering fault. Watch what happens here
 * between deltas: the drain floors at 83 characters a second and the wire writes at
 * about 170, so the edge stalls for only a fraction of the message, and when it does it
 * stalls on a whole-pixel gradient rather than on a word at 8% opacity.
 */
export default function AgentSaySoftFrame() {
	return <StreamStage words="soft" log="cut" focus="say" />;
}
