import { DoorCanvas } from "shared/ui/explore/components/door";

/**
 * Take two: the hold dot ([spool-cloud#32](https://github.com/liamvinberg/spool-cloud/issues/32)).
 * A shut page whose frames render the held element already wears one dot at its
 * count. The library is the page `Button` is defined on, so it wears the same
 * dot for the same reason. No fill. The row says what every other marked row
 * says, in the one vocabulary the hold already has.
 */
export default function LitDotFrame() {
	return <DoorCanvas where="foot" start="booking" litAs="dot" />;
}
