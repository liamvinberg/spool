import { SharedScreen } from "shared/ui/explore/manipulate/shared-screen";

/**
 * Quiet until it matters. Nothing marks a shared element while you point at it,
 * hover and selection are the ones you already know, and the rail names the
 * file the way it names any other file.
 *
 * The first write of the session is the only moment spool spends: the frames
 * that changed light for a second and a hairline runs to each of them from what
 * you edited. After that it never says it again, on the argument that you have
 * been told and the telling was the point.
 *
 * `reset` in the rail returns the session so the first write can be felt twice.
 */
export default function SharedWakeFrame() {
	return <SharedScreen take="wake" />;
}
