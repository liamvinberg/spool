import { DoorCanvas } from "shared/ui/explore/components/door";

/**
 * Take four: the spine ([spool-cloud#32](https://github.com/liamvinberg/spool-cloud/issues/32)).
 * The active page carries a 2px thread bar on its left edge. The lit library row
 * carries the same bar without the fill: a second place the canvas is pointing.
 * The cost is two spines in one rail, and the spine has meant "you are here"
 * since the rail shipped.
 */
export default function LitSpineFrame() {
	return <DoorCanvas where="foot" start="booking" litAs="spine" />;
}
