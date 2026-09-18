import { rounded, type Spacing } from "../editing/gap";

// Keep the approved stepping rule; ambiguous names require an explicit pick.
export function gapValue(px: number, binding: string | null, choices: Spacing[]) {
	if (!binding) return `${rounded(Math.max(0, px))}px`;
	const current = choices.find((item) => item.css === binding);
	if (!current) return binding;
	const scale = binding.startsWith("calc(");
	const options = choices.filter((item) => item.css.startsWith("calc(") === scale);
	const distance = Math.min(...options.map((item) => Math.abs(item.px - px)));
	const nearest = options.filter((item) => Math.abs(Math.abs(item.px - px) - distance) < 0.001);
	if (nearest.some((item) => item.css === binding)) return binding;
	return nearest.length === 1 ? nearest[0]!.css : binding;
}
