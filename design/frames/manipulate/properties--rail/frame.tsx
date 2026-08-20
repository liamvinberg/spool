import { PropertiesScreen } from "../../../shared/ui/spool-properties-screen";

/**
 * The baseline: a right rail the canvas does not have today, showing only what the
 * spikes can write — text, w and h, the spacing tokens the element carries — in
 * Tailwind's own words, and nothing else. Everything the element computes to that
 * the hands cannot touch is simply not here. The source line under the fields is
 * the literal as it now stands, with every spliced token lit.
 *
 * During a drag the w or h field ticks and the readout rides the knob; the rail
 * itself never moves.
 */
export default function PropertiesRailFrame() {
	return <PropertiesScreen config={{ surface: "rail", vocab: "tailwind", tail: false, agent: "off" }} />;
}
