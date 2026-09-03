import { StreamStage } from "shared/ui/explore/agent/stream-stage";

/**
 * agent-say-fade: the rail today, kept as the row everything below is a diff against.
 *
 * #149's drain lets about 83 characters a second through, and each word fades in over
 * 170ms the moment the edge reaches it. The drawn prefix is rendered as text over an
 * invisible copy of everything that has landed, which holds the height.
 *
 * Two things are visible here that the still cannot show. The unit is a word, so the
 * edge moves in steps of a word and each step is a small pop, two or three of them in
 * flight at once. And the height is the reserve's: a delta lands and the block gains a
 * line or two at once, then the words spend the next half second catching up into space
 * that is already there.
 */
export default function AgentSayFadeFrame() {
	return <StreamStage words="fade" log="cut" focus="say" />;
}
