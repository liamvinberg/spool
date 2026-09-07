import { OffprintLanding } from "shared/ui/site/demo-apps/landing";
import { ShaderField } from "./field";
import breathe from "./shaders/breathe.glsl";
import ripple from "./shaders/ripple.glsl";
import drift from "./shaders/drift.glsl";
import weave from "./shaders/weave.glsl";
import contours from "./shaders/contours.glsl";
import thread from "./shaders/thread.glsl";
import ribbon from "./shaders/ribbon.glsl";
import cloth from "./shaders/cloth.glsl";
import bloom from "./shaders/bloom.glsl";
import orbit from "./shaders/orbit.glsl";
import interference from "./shaders/interference.glsl";
import liquid from "./shaders/liquid.glsl";
import "./shaders.css";

const directions = {
	breathe: { n: "01", name: "breathing grid", fragment: breathe, note: "The canvas grid, taking a breath.", input: "move across the dots" },
	ripple: { n: "02", name: "ripple grid", fragment: ripple, note: "A small disturbance travels outward.", input: "move to make a second source" },
	drift: { n: "03", name: "drifting field", fragment: drift, note: "Dots loosen into a slow current.", input: "move to bend the current" },
	weave: { n: "04", name: "woven lines", fragment: weave, note: "Two sets of threads move together.", input: "ambient · two crossing fields" },
	contours: { n: "05", name: "contours", fragment: contours, note: "A landscape drawn in vermilion.", input: "move to shift the contours" },
	thread: { n: "06", name: "loose thread", fragment: thread, note: "A few lines, loosely wound.", input: "ambient · continuous filament" },
	ribbon: { n: "07", name: "winding ribbon", fragment: ribbon, note: "The mark’s shape, turning slowly.", input: "ambient · folded bands" },
	cloth: { n: "08", name: "graphite cloth", fragment: cloth, note: "A fine mesh lifts and settles.", input: "ambient · moving folds" },
	bloom: { n: "09", name: "red diffusion", fragment: bloom, note: "A little pigment in the dark.", input: "ambient · grain stays still" },
	orbit: { n: "10", name: "orbital cloud", fragment: orbit, note: "Points gather around an open centre.", input: "ambient · slow precession" },
	interference: { n: "11", name: "interference", fragment: interference, note: "Two circles make a changing pattern.", input: "ambient · offset rings" },
	liquid: { n: "12", name: "liquid relief", fragment: liquid, note: "Vermilion catches the light.", input: "ambient · shifting surface" },
} as const;
export type ShaderTake = keyof typeof directions;

function HeroArt({ take }: { take: ShaderTake }) {
	const direction = directions[take];
	return (
		<div className="ss-field" data-direction={take} aria-hidden="true">
			<ShaderField fragment={direction.fragment} paused={false} />
		</div>
	);
}

/** The selected landing, unchanged below its hero. */
export function ShaderLanding({ take }: { take: ShaderTake }) {
	return <div className="ss-page" data-shader={take}><OffprintLanding take="play" heroArt={<HeroArt take={take} />} /></div>;
}
