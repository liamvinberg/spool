import { ShaderHero } from "shared/ui/explore/shaders/hero";
import { ShaderSurface } from "shared/ui/explore/shaders/surface";
import { createTsl } from "shared/ui/explore/shaders/tsl";

export default function Frame() {
	return <ShaderHero engine="tsl · webgpu preferred"><ShaderSurface create={createTsl} /></ShaderHero>;
}
