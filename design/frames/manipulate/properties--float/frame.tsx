import { PropertiesScreen } from "../../../shared/ui/spool-properties-screen";

/**
 * No rail at all, which is the honest shipped canvas once #238 lands: the surface is a
 * card that sits under the selected element, carries the writable few, and names the
 * element by its crumbs. A drag on a knob hides the card and the readout takes over at
 * the knob; the card returns on the drop, re-anchored to the element's new box. The
 * cost is legible immediately: there is nowhere for a long tail to go.
 */
export default function PropertiesFloatFrame() {
	return <PropertiesScreen config={{ surface: "float", vocab: "tailwind", tail: false, agent: "off" }} />;
}
