import {
	AnimatePresence,
	animate,
	type AnimationPlaybackControls,
	type MotionValue,
	motion,
	useMotionValue,
	useTransform,
} from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { cn } from "shared/lib/utils";
import { UnseenMark } from "shared/ui/spool/unseen-mark";
import { Faces, member as personOf } from "shared/ui/explore/cloud/home/parts";
import { type Cam, clamp, FrameBody, GLIDE, type Page, type Spec } from "./fixture";

/**
 * The field every take of the read-only canvas pans: one camera made of three
 * motion values, so a glide, a drag, a pinch and the coast after a flick all
 * write the same numbers and never fight. Nothing here writes anywhere else.
 *
 * Prototype only.
 */

export interface Camera {
	x: MotionValue<number>;
	y: MotionValue<number>;
	z: MotionValue<number>;
	get: () => Cam;
	set: (cam: Cam) => void;
	fly: (cam: Cam) => void;
	stop: () => void;
}

export function useCamera(): Camera {
	const x = useMotionValue(0);
	const y = useMotionValue(0);
	const z = useMotionValue(1);
	const running = useRef<AnimationPlaybackControls[]>([]);
	return useMemo(() => {
		const stop = () => {
			for (const c of running.current) c.stop();
			running.current = [];
			x.stop();
			y.stop();
		};
		const get = () => ({ x: x.get(), y: y.get(), z: z.get() });
		return {
			x,
			y,
			z,
			get,
			stop,
			set: (cam: Cam) => {
				stop();
				x.set(cam.x);
				y.set(cam.y);
				z.set(cam.z);
			},
			// one progress drives all three, so a world point travels a straight line
			// on screen while the zoom changes under it
			fly: (to: Cam) => {
				stop();
				const from = get();
				running.current = [
					animate(0, 1, {
						...GLIDE,
						onUpdate: (p: number) => {
							x.set(from.x + (to.x - from.x) * p);
							y.set(from.y + (to.y - from.y) * p);
							z.set(from.z + (to.z - from.z) * p);
						},
					}),
				];
			},
		};
	}, [x, y, z]);
}

/** where a world point is on screen, live */
export function useScreen(cam: Camera, wx: number | MotionValue<number>, wy: number | MotionValue<number>) {
	const sx = useTransform(() => (typeof wx === "number" ? wx : wx.get()) * cam.z.get() + cam.x.get());
	const sy = useTransform(() => (typeof wy === "number" ? wy : wy.get()) * cam.z.get() + cam.y.get());
	return { sx, sy };
}

export interface FieldProps {
	cam: Camera;
	page: Page;
	member: boolean;
	changed: boolean;
	/** a frame out being played: its card steps aside so there is only ever one */
	away?: string | undefined;
	onTap?: ((name: string, el: HTMLElement) => void) | undefined;
	/** draw labels at all (a phone at shelf size has no room) */
	labels?: boolean;
	small?: boolean;
	cursors?: ReactNode;
	className?: string;
	children?: ReactNode;
	fieldRef?: React.RefObject<HTMLDivElement | null>;
	/** called after the old page has gone and before the new one arrives */
	onSwap?: (() => void) | undefined;
}

export function Field({ cam, page, member, changed, away, onTap, labels = true, small = false, cursors, className, children, fieldRef, onSwap }: FieldProps) {
	const own = useRef<HTMLDivElement | null>(null);
	const ref = fieldRef ?? own;
	const pointers = useRef(new Map<number, { x: number; y: number }>());
	const gesture = useRef<{ moved: number; frame: string | null; el: HTMLElement | null }>({ moved: 0, frame: null, el: null });
	const coast = useRef<AnimationPlaybackControls[]>([]);

	useEffect(() => {
		const el = ref.current;
		if (el === null) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			cam.stop();
			if (event.ctrlKey || event.metaKey) {
				const box = el.getBoundingClientRect();
				zoomAt(cam, event.clientX - box.left, event.clientY - box.top, Math.exp(-event.deltaY * 0.01));
			} else {
				cam.x.set(cam.x.get() - event.deltaX);
				cam.y.set(cam.y.get() - event.deltaY);
			}
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [cam, ref]);

	const local = (event: React.PointerEvent) => {
		const box = ref.current?.getBoundingClientRect();
		return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
	};

	return (
		<div
			ref={ref}
			className={cn("absolute inset-0 touch-none overflow-hidden bg-canvas select-none", className)}
			onPointerDown={(event) => {
				if ((event.target as HTMLElement).closest("button,[data-chrome]") !== null) return;
				for (const c of coast.current) c.stop();
				cam.stop();
				event.currentTarget.setPointerCapture(event.pointerId);
				pointers.current.set(event.pointerId, local(event));
				const hit = (event.target as HTMLElement).closest<HTMLElement>("[data-frame]");
				gesture.current = { moved: pointers.current.size > 1 ? 99 : 0, frame: hit?.dataset.frame ?? null, el: hit };
			}}
			onPointerMove={(event) => {
				const prev = pointers.current.get(event.pointerId);
				if (prev === undefined) return;
				const next = local(event);
				if (pointers.current.size === 1) {
					cam.x.set(cam.x.get() + next.x - prev.x);
					cam.y.set(cam.y.get() + next.y - prev.y);
					gesture.current.moved += Math.abs(next.x - prev.x) + Math.abs(next.y - prev.y);
				} else {
					const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
					if (other !== undefined) {
						const before = Math.hypot(prev.x - other.x, prev.y - other.y);
						const after = Math.hypot(next.x - other.x, next.y - other.y);
						const mid = { x: (next.x + other.x) / 2, y: (next.y + other.y) / 2 };
						cam.x.set(cam.x.get() + (next.x - prev.x) / 2);
						cam.y.set(cam.y.get() + (next.y - prev.y) / 2);
						if (before > 0) zoomAt(cam, mid.x, mid.y, after / before);
					}
				}
				pointers.current.set(event.pointerId, next);
			}}
			onPointerUp={(event) => {
				const single = pointers.current.size === 1;
				pointers.current.delete(event.pointerId);
				if (!single) return;
				const g = gesture.current;
				if (g.moved < 6) {
					if (g.frame !== null && g.el !== null) onTap?.(g.frame, g.el);
					return;
				}
				// a flick keeps going and settles, the way a scroll view does
				coast.current = [
					animate(cam.x, cam.x.get(), { type: "inertia", velocity: cam.x.getVelocity(), power: 0.25, timeConstant: 260 }),
					animate(cam.y, cam.y.get(), { type: "inertia", velocity: cam.y.getVelocity(), power: 0.25, timeConstant: 260 }),
				];
			}}
			onPointerCancel={(event) => pointers.current.delete(event.pointerId)}
		>
			<AnimatePresence mode="wait" onExitComplete={onSwap}>
				<motion.div key={page.name} className="absolute inset-0" exit={{ opacity: 0, transition: { duration: 0.12 } }}>
					<World cam={cam} page={page} changed={changed} away={away} tappable={onTap !== undefined} />
					{labels
						? page.frames.map((spec, i) => (
								<Label key={spec.name} cam={cam} spec={spec} index={i} member={member} changed={changed} away={away} small={small} />
							))
						: null}
				</motion.div>
			</AnimatePresence>
			{cursors}
			{children}
		</div>
	);
}

function zoomAt(cam: Camera, px: number, py: number, factor: number) {
	const z0 = cam.z.get();
	const z = clamp(z0 * factor, 0.06, 2.5);
	cam.x.set(px - ((px - cam.x.get()) * z) / z0);
	cam.y.set(py - ((py - cam.y.get()) * z) / z0);
	cam.z.set(z);
}

function World({ cam, page, changed, away, tappable }: { cam: Camera; page: Page; changed: boolean; away?: string | undefined; tappable: boolean }) {
	const byName = new Map(page.frames.map((f) => [f.name, f]));
	return (
		<motion.div className="absolute top-0 left-0" style={{ x: cam.x, y: cam.y, scale: cam.z, originX: 0, originY: 0 }}>
			<svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width="1" height="1" aria-hidden="true">
				{page.threads.map((thread, i) => {
					const a = byName.get(thread.from);
					const b = byName.get(thread.to);
					if (a === undefined || b === undefined) return null;
					const x1 = a.x + a.w + 10;
					const y1 = a.y + a.h / 2;
					const x2 = b.x - 16;
					const y2 = b.y + b.h / 2;
					const mid = (x1 + x2) / 2;
					return (
						<motion.g key={`${thread.from}-${thread.to}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 + i * 0.08, duration: 0.3 }}>
							{/* a might is dashed, and pathLength owns the dash array, so only a will draws itself in */}
							{thread.might === true ? (
								<path
									d={`M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`}
									stroke="var(--color-thread)"
									strokeWidth="1.5"
									fill="none"
									vectorEffect="non-scaling-stroke"
									strokeDasharray="5 5"
								/>
							) : (
								<motion.path
									d={`M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`}
									stroke="var(--color-thread)"
									strokeWidth="1.5"
									fill="none"
									initial={{ pathLength: 0 }}
									animate={{ pathLength: 1 }}
									transition={{ delay: 0.25 + i * 0.08, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
								/>
							)}
							<path d={`M${x2 + 14} ${y2}l-14 -8v16Z`} fill="var(--color-thread)" />
						</motion.g>
					);
				})}
			</svg>
			{page.frames.map((spec, i) => (
				<motion.div
					key={spec.name}
					data-frame={spec.name}
					className={cn("group absolute", tappable && "cursor-pointer")}
					style={{ left: spec.x, top: spec.y, width: spec.w, height: spec.h }}
					initial={{ opacity: 0, scale: 0.97, y: 16 }}
					animate={{ opacity: away === spec.name ? 0 : 1, scale: 1, y: 0 }}
					transition={away === spec.name ? { duration: 0 } : { ...GLIDE, delay: i * 0.05 }}
				>
					<div className="pointer-events-none h-full w-full">
						<FrameBody spec={spec} changed={changed} />
					</div>
					{tappable ? (
						<span className="pointer-events-none absolute -inset-[6px] rounded-[28px] border-2 border-text/0 transition-colors duration-150 group-hover:border-text/25" />
					) : null}
					{changed && spec.name === "cart" ? (
						<motion.span
							className="pointer-events-none absolute -inset-[8px] rounded-[30px] border-[3px] border-thread"
							initial={{ opacity: 0, scale: 1 }}
							animate={{ opacity: [0, 1, 1, 0], scale: [1, 1, 1.015, 1.03] }}
							transition={{ duration: 1.6, times: [0, 0.1, 0.5, 1] }}
						/>
					) : null}
				</motion.div>
			))}
		</motion.div>
	);
}

function Label({
	cam,
	spec,
	index,
	member,
	changed,
	away,
	small,
}: {
	cam: Camera;
	spec: Spec;
	index: number;
	member: boolean;
	changed: boolean;
	away?: string | undefined;
	small: boolean;
}) {
	const x = useTransform(() => spec.x * cam.z.get() + cam.x.get());
	const y = useTransform(() => spec.y * cam.z.get() + cam.y.get() - (small ? 20 : 24));
	const width = useTransform(() => Math.max(spec.w * cam.z.get(), 60));
	const here = member ? HERE_ON(spec.name) : [];
	const lit = changed && spec.name === "cart";
	return (
		<motion.div
			className="pointer-events-none absolute top-0 left-0 flex items-center gap-1.5"
			style={{ x, y, width }}
			initial={{ opacity: 0 }}
			animate={{ opacity: away === spec.name ? 0 : 1 }}
			transition={{ delay: away === undefined ? 0.1 + index * 0.05 : 0, duration: 0.2 }}
		>
			<span className={cn("min-w-0 truncate", small ? "type-detail" : "type-value", lit ? "text-text" : "text-muted")}>{spec.name}</span>
			<AnimatePresence>
				{lit ? (
					<motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", visualDuration: 0.3, bounce: 0.4 }}>
						<UnseenMark mark="changed" />
					</motion.span>
				) : null}
			</AnimatePresence>
			{here.length > 0 ? <Faces ids={here} size={small ? 14 : 16} /> : null}
		</motion.div>
	);
}

const HERE_ON = (frame: string) => (frame === "cart" ? ["jonas"] : frame === "menu" ? ["mira"] : []);

/**
 * Someone's pointer, in world space so it rides the camera. It moves on a soft
 * spring between the points the script gives it, which is what a pointer
 * relayed every few frames looks like once it is smoothed.
 */
export function LiveCursor({ cam, id, path, small = false }: { cam: Camera; id: string; path: { at: number; x: number; y: number }[]; small?: boolean }) {
	const first = path[0] ?? { x: 0, y: 0 };
	const wx = useMotionValue(first.x);
	const wy = useMotionValue(first.y);
	const { sx, sy } = useScreen(cam, wx, wy);
	useEffect(() => {
		const timers = path.slice(1).map((p) =>
			window.setTimeout(() => {
				animate(wx, p.x, { type: "spring", visualDuration: 0.9, bounce: 0 });
				animate(wy, p.y, { type: "spring", visualDuration: 0.9, bounce: 0 });
			}, p.at),
		);
		return () => {
			for (const t of timers) window.clearTimeout(t);
		};
	}, [path, wx, wy]);
	const person = personOf(id);
	return (
		<motion.span
			className="pointer-events-none absolute top-0 left-0 z-10 flex items-start"
			style={{ x: sx, y: sy }}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ delay: 0.6, duration: 0.3 }}
		>
			<svg width={small ? 12 : 14} height={small ? 14 : 16} viewBox="0 0 14 16" aria-hidden="true">
				<path d="M1 1 13 8.2 7.4 9.3 4.6 14.6Z" fill={person.hue} stroke="#111" strokeWidth="1" strokeLinejoin="round" />
			</svg>
			<span
				className={cn("-ml-[2px] rounded-[4px] px-[6px] py-[1px] text-[#151515]", small ? "mt-[10px] text-[10px] leading-[14px]" : "mt-[12px] type-detail")}
				style={{ background: person.hue }}
			>
				{person.first}
			</span>
		</motion.span>
	);
}
