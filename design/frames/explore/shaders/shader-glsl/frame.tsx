import { createGlsl } from "shared/ui/explore/shaders/glsl";
import { ShaderHero } from "shared/ui/explore/shaders/hero";
import { ShaderSurface } from "shared/ui/explore/shaders/surface";

export default function Frame() {
	return <ShaderHero engine="glsl · webgl"><ShaderSurface create={createGlsl} /></ShaderHero>;
}
