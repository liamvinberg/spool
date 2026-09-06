import { ShaderHero } from "shared/ui/explore/shaders/hero";
import { ShaderSurface } from "shared/ui/explore/shaders/surface";
import { createTsl } from "shared/ui/explore/shaders/tsl";

const createFallback = (canvas: HTMLCanvasElement) => createTsl(canvas, true);

export default function Frame() {
	return <ShaderHero engine="tsl · webgl fallback"><ShaderSurface create={createFallback} /></ShaderHero>;
}
