import { DoorCanvas } from "shared/ui/explore/components/door";

/**
 * How the `library` row lights under a hold, take one: the shipped finder fill
 * ([spool-cloud#32](https://github.com/liamvinberg/spool-cloud/issues/32)).
 * `bg-surface`, the same fill the finder puts on an owning page and the same
 * fill a hovered or selected row wears. Nothing new, and the cost is that beside
 * a hold drawn wholly in thread red a grey fill reads as switched off.
 */
export default function LitSurfaceFrame() {
	return <DoorCanvas where="foot" start="booking" litAs="surface" />;
}
