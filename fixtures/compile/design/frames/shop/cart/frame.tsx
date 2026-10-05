import { cn } from "shared/lib/utils";
import { ui } from "spool";

export default function Cart() {
	const { cart } = ui.use() as { cart: number };
	return (
		<section className={cn("flex min-h-screen flex-col items-center justify-center gap-4", cart > 0 && "bg-ink")}>
			<h2 className="text-2xl font-semibold text-paper">{cart} in your bag</h2>
			<button type="button" data-go="home" className="rounded-full border border-paper/40 px-5 py-2 text-paper">
				Back
			</button>
		</section>
	);
}
