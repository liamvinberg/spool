import { motion } from "motion/react";
import { useEffect, useState } from "react";
import dot from "shared/assets/dot.svg";
import menu from "shared/lib/menu.json";
import glow from "shared/shaders/glow.glsl?raw";
import { Button } from "shared/ui/button";
import styles from "./hero.module.css";
import { formatPrice } from "./parts/price.js";
import "./home.css";

class Ticker {
	count = 0;
	tick() {
		this.count += 1;
		return this.count;
	}
}

export default function Home() {
	const [ticks, setTicks] = useState(0);
	useEffect(() => {
		const ticker = new Ticker();
		const id = setInterval(() => setTicks(ticker.tick()), 1000);
		return () => clearInterval(id);
	}, []);
	return (
		<main className={`${styles.hero} min-h-screen bg-paper text-ink`}>
			<motion.h1 layout className="font-display text-4xl tracking-tight md:text-6xl">
				{menu.title}
			</motion.h1>
			<ul className="mt-6 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2">
				{menu.items.map((item) => (
					<li key={item.name} className="contents">
						<span className="flex items-center gap-2">
							<img src={dot} alt="" className="size-2" />
							{item.name}
						</span>
						<span className="text-right tabular-nums">
							{formatPrice({ amount: item.price, currency: "SEK" })}
						</span>
					</li>
				))}
			</ul>
			<p data-shader-length={glow.length} className="mt-4 text-xs text-ink/60">
				open for {ticks}s
			</p>
			<div className="mt-8 flex gap-3">
				<Button>
					<span data-go="shop/cart">Order</span>
				</Button>
				<Button tone="quiet">Later</Button>
			</div>
		</main>
	);
}
