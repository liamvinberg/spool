import { ThreadsStage } from "shared/ui/explore/threads/threads-stage";

/**
 * threads-ask: the same chrome, and a thread is called what you asked for.
 *
 * The smallest diff. The nameplate carries the first thing the person said, truncated to
 * the one line it has, in the sentence register rather than mono because it is a sentence
 * and a person said it. The flyout is where the change earns its keep: the ask wraps to
 * three lines there, and the frames the thread wrote move to the second line, where the
 * last row used to be.
 *
 * What the column loses is nothing, because the column never showed a name. What the plate
 * loses is `home, receipt`, which is the one thing the shipped name did well: two threads
 * on the same frame now read differently, and a thread that wrote nothing reads the same
 * as one that wrote six frames.
 */
export default function ThreadsAskFrame() {
	return <ThreadsStage take="ask" />;
}
