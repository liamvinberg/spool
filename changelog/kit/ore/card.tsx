import { animate, motion, useAnimationFrame, useMotionValue, useSpring, useTransform } from "motion/react";
import { type CSSProperties, useEffect, useRef } from "react";

/**
 * The card itself: brushed steel in one colour, sitting in space. It sways
 * on its own, follows the pointer when one is over it, and swings round
 * when its colour changes.
 */

const W = 330;
const H = 208;

const light = (hex: string) => {
	const v = hex.replace("#", "");
	const n = Number.parseInt(v.length === 3 ? v.replace(/./g, (c) => c + c) : v.slice(0, 6), 16);
	const r = (n >> 16) & 255,
		g = (n >> 8) & 255,
		b = n & 255;
	return 0.299 * r + 0.587 * g + 0.114 * b > 160;
};

function Chip() {
	return (
		<svg aria-hidden="true" width="46" height="36" viewBox="0 0 46 36">
			<defs>
				<linearGradient id="ore-chip" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="#f3e2bd" />
					<stop offset="0.5" stopColor="#cfb07a" />
					<stop offset="1" stopColor="#efd9a8" />
				</linearGradient>
			</defs>
			<rect x="0.5" y="0.5" width="45" height="35" rx="7" fill="url(#ore-chip)" stroke="rgba(80,60,20,0.35)" />
			<path
				d="M0 12h14M0 24h14M32 12h14M32 24h14M14 0v36M32 0v36M14 18h18"
				stroke="rgba(80,60,20,0.4)"
				strokeWidth="1"
				fill="none"
			/>
		</svg>
	);
}

export function PayCard({
	colour,
	radius,
	width = W,
	swingKey,
	still,
	name = "Ellie Brooks",
	style,
}: {
	colour: string;
	radius: number | number[];
	width?: number;
	swingKey?: string;
	still?: boolean;
	name?: string;
	style?: CSSProperties;
}) {
	const scale = width / W;
	const ink = light(colour) ? "rgba(21,21,21,0.86)" : "rgba(255,255,255,0.92)";
	const stage = useRef<HTMLDivElement>(null);
	const pointer = useRef<{ x: number; y: number } | null>(null);

	const tx = useMotionValue(0);
	const ty = useMotionValue(0);
	const rx = useSpring(tx, { stiffness: 120, damping: 18 });
	const ry = useSpring(ty, { stiffness: 120, damping: 18 });
	const swing = useMotionValue(0);
	const rotateY = useTransform([ry, swing], ([a, b]: number[]) => a! + b!);
	const sheen = useTransform(rotateY, (v: number) => `${50 - v * 2.4}% 50%`);
	const floor = useTransform(rotateY, (v: number) => `translateX(${v * 0.8}px) scaleX(${1 - Math.abs(v) / 260})`);

	useAnimationFrame((t: number) => {
		if (pointer.current) {
			tx.set(-pointer.current.y * 14);
			ty.set(pointer.current.x * 20);
		} else if (!still) {
			tx.set(Math.sin(t / 1700) * 6 + 4);
			ty.set(Math.sin(t / 2400) * 12);
		} else {
			tx.set(6);
			ty.set(-8);
		}
	});

	const first = useRef(true);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new colour swings the card
	useEffect(() => {
		if (first.current) {
			first.current = false;
			return;
		}
		const run = animate(swing, [-34, 0], { type: "spring", bounce: 0.45, duration: 0.9 });
		return () => run.stop();
	}, [swingKey, swing]);

	const radii = Array.isArray(radius) ? radius.map((v) => `${v * scale}px`).join(" ") : radius * scale;

	return (
		<div
			ref={stage}
			className="relative"
			style={{ width, height: H * scale + 36 * scale, perspective: 1000 * scale, ...style }}
			onPointerMove={(e) => {
				const r = stage.current!.getBoundingClientRect();
				pointer.current = { x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 };
			}}
			onPointerLeave={() => {
				pointer.current = null;
			}}
		>
			<motion.span
				aria-hidden
				className="absolute left-[8%] h-[14%] w-[84%] rounded-[50%] bg-[rgba(21,21,21,0.22)] blur-[14px]"
				style={{ top: H * scale + 8 * scale, transform: floor }}
			/>
			<motion.div
				className="absolute inset-x-0 top-0 overflow-hidden"
				style={{
					height: H * scale,
					borderRadius: radii,
					rotateX: rx,
					rotateY,
					background: colour,
					transition: "background-color 500ms cubic-bezier(0.23, 1, 0.32, 1)",
					color: ink,
				}}
			>
				<span
					aria-hidden
					className="absolute inset-0 opacity-[0.16]"
					style={{
						background: "repeating-linear-gradient(0deg, rgba(255,255,255,0.35) 0 1px, transparent 1px 3px)",
						mixBlendMode: "overlay",
					}}
				/>
				<motion.span
					aria-hidden
					className="absolute inset-0"
					style={{
						background:
							"linear-gradient(115deg, transparent 32%, rgba(255,255,255,0.32) 46%, rgba(255,255,255,0.05) 54%, transparent 64%)",
						backgroundSize: "260% 100%",
						backgroundPosition: sheen,
					}}
				/>
				<span aria-hidden className="absolute inset-0 rounded-[inherit] border border-[rgba(255,255,255,0.16)]" />
				<div
					className="absolute inset-0 origin-top-left"
					style={{ width: W, height: H, transform: `scale(${scale})` }}
				>
					<span className="absolute top-6 left-6 text-[22px] leading-none font-bold tracking-[-0.04em]">ore</span>
					<svg
						aria-hidden="true"
						className="absolute top-6 right-6"
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.8"
						strokeLinecap="round"
					>
						<path d="M8 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M16 3.5a12 12 0 0 1 0 17" />
					</svg>
					<span className="absolute top-[76px] left-6">
						<Chip />
					</span>
					<span className="absolute bottom-6 left-6 text-[15px] font-semibold">{name}</span>
					<span className="absolute right-6 bottom-6 text-right text-[13px] leading-[1.3] font-semibold">
						<span className="block opacity-70">Debit</span>
						•• 4417
					</span>
				</div>
			</motion.div>
		</div>
	);
}
