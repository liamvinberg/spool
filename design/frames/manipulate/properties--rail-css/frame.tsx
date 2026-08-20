import { PropertiesScreen } from "../../../shared/ui/spool-properties-screen";

/**
 * The curated rail, in CSS's vocabulary instead of Tailwind's: `width 300px` where
 * the baseline says `w full`, `padding 16px` where it says `p 4`. You type pixels;
 * spool picks the token (`w-90` on a whole step, `w-[347px]` off it) and the source
 * line is the only place the class appears. Arrow keys step a pixel here and a scale
 * unit on the Tailwind frames, which is the whole difference in one key.
 */
export default function PropertiesRailCssFrame() {
	return <PropertiesScreen config={{ surface: "rail", vocab: "css", tail: false, agent: "off" }} />;
}
