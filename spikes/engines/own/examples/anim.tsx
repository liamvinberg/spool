// The feel bench's animated card (bench/anim.html) in the own-engine vocabulary, N times in one surface.
import { useEffect, useState } from "react";
import { Text, View } from "own";

declare const __N__: number;

function useClock() {
	const [t, setT] = useState(0);
	useEffect(() => {
		let raf = 0;
		const start = performance.now();
		const loop = (now: number) => {
			setT((now - start) / 1000);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, []);
	return t;
}

const ease = (x: number) => 0.5 - Math.cos(Math.PI * x) / 2;

function Card({ t }: { t: number }) {
	const pulse = ease((t % 1.2) / 0.6 > 1 ? 2 - (t % 1.2) / 0.6 : (t % 1.2) / 0.6);
	const g = (t % 4) / 2;
	const grow = 5 + 90 * ease(g > 1 ? 2 - g : g);
	return (
		<View style={{ width: 390, height: 300, padding: 20, gap: 14, borderRadius: 16, overflow: "hidden", backgroundImage: "linear-gradient(160deg, #1f2937 0%, #111827 100%)" }}>
			<View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
				<View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 4, borderColor: "#374151", transform: [{ rotate: `${(t % 1) * 360}deg` }] }}>
					<View style={{ position: "absolute", top: -4, left: 8, width: 16, height: 4, backgroundColor: "#f97316" }} />
				</View>
				<View>
					<Text style={{ color: "#e5e7eb", fontWeight: 700 }}>Uploading 3 files</Text>
					<Text style={{ color: "#9ca3af" }}>design/frames/checkout</Text>
				</View>
			</View>
			<View style={{ height: 10, borderRadius: 5, backgroundColor: "#22c55e", opacity: 0.3 + 0.7 * pulse, transform: [{ scaleX: 0.6 + 0.4 * pulse }] }} />
			<View style={{ height: 8, borderRadius: 4, backgroundColor: "#1f2937" }}>
				<View style={{ height: 8, borderRadius: 4, backgroundColor: "#60a5fa", width: `${grow}%` }} />
			</View>
			<View style={{ flexDirection: "row", gap: 6 }}>
				{[0, 0.15, 0.3].map((d) => {
					const p = ((t + 0.9 - d) % 0.9) / 0.45;
					return <View key={d} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#e5e7eb", transform: [{ translateY: -8 * ease(p > 1 ? 2 - p : p) }] }} />;
				})}
			</View>
			<Text style={{ color: "#9ca3af" }}>A card that never stops moving: a spinner and dots, a bar whose width changes layout every frame.</Text>
		</View>
	);
}

export default function Anim() {
	const t = useClock();
	return (
		<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, width: 2400, backgroundColor: "#000" }}>
			{Array.from({ length: __N__ }, (_, i) => (
				<Card key={i} t={t} />
			))}
		</View>
	);
}
