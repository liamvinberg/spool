import { AnimatePresence, LayoutGroup, MotionConfig, Reorder, motion, useReducedMotion } from "motion/react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolCanvasScreen } from "shared/ui/spool/canvas-screen";
import { SpoolHomeScreen } from "shared/ui/spool/home-screen";
import "./header-study.css";

export type HeaderTake = "toolbar" | "line" | "attached" | "sidebar" | "browser";
export type HeaderState = "project" | "home" | "crowded";
export type HeaderWidth = "content" | "equal" | "shrink";

const PROJECTS = ["spool", "grepp", "origin-edits", "kaffe", "inwall", "tidemark", "kvitt", "solar", "mento", "aria", "components", "an unusually long project name"];
const BROWSER_PROJECTS = ["spool", "notaker v2", "inwall v2", "aria", "competitor study 2026-09-05", "kaffe", "kvitt", "solar", "mento", "origin-edits", "components", "components and interaction patterns"];
const TAKES = {
	toolbar: { title: "Toolbar", note: "Home is a tool. A soft surface follows the selected project.", duration: 0.22 },
	line: { title: "Underline", note: "Plain Home, quiet tabs. One line moves between projects.", duration: 0.18 },
	attached: { title: "Joined", note: "Home stands apart. The selected tab joins the canvas below.", duration: 0.24 },
	sidebar: { title: "Sidebar", note: "Home belongs to the navigation column. Projects start at the canvas.", duration: 0.22 },
	browser: { title: "Browser", note: "Home belongs to navigation. The project tabs join the canvas.", duration: 0.2 },
};
const WIDTHS = {
	content: { title: "By name", note: "Short names take less room. Long names stop growing." },
	equal: { title: "Equal", note: "Every project gets the same space, even when its name is short." },
	shrink: { title: "Shrink", note: "Tabs narrow together as more projects open." },
};

/** Copies the app canvas into a Mac window; only the header is under study. */
export function HeaderStudy({ take, state = "project", width = "equal" }: { take: HeaderTake; state?: HeaderState; width?: HeaderWidth }) {
	const projects = take === "browser" ? BROWSER_PROJECTS : PROJECTS;
	const [tabs, setTabs] = useState(() => projects.slice(0, state === "crowded" ? projects.length : take === "browser" ? 5 : 3));
	const [active, setActive] = useState<string | null>(state === "home" ? null : state === "crowded" ? projects[8] ?? null : "spool");
	const [keyboard, setKeyboard] = useState(false);
	const scroller = useRef<HTMLDivElement>(null);
	const dragged = useRef(false);
	const dragging = useRef(false);
	const next = useRef(projects.length);
	const group = useId();
	const reduced = useReducedMotion();
	const spec = TAKES[take];
	const caption = take === "browser" ? WIDTHS[width] : spec;
	const duration = reduced || keyboard ? 0 : spec.duration;

	useLayoutEffect(() => {
		const element = scroller.current;
		if (element === null) return;
		const reveal = () => {
			if (active === null || dragging.current) return;
			element.querySelector("[aria-current='page']")?.closest(".study-tab")?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
		};
		reveal();
		const observer = new ResizeObserver(reveal);
		observer.observe(element);
		return () => observer.disconnect();
	}, [active]);

	function close(name: string) {
		const index = tabs.indexOf(name);
		setTabs((current) => current.filter((tab) => tab !== name));
		if (active === name) setActive(tabs[index + 1] ?? tabs[index - 1] ?? null);
	}

	function open() {
		const candidate = projects.find((name) => !tabs.includes(name)) ?? `untitled-${++next.current}`;
		setTabs((current) => [...current, candidate]);
		setActive(candidate);
	}

	return (
		<MotionConfig reducedMotion="user" transition={{ duration, ease: [0.23, 1, 0.32, 1] }}>
			<div className="header-study flex h-full flex-col bg-[#101011] p-6 font-sans text-text antialiased" data-take={take} data-width={width}>
				<div className="study-window flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#39393b]">
					<header
						className="study-header"
						onPointerDownCapture={() => setKeyboard(false)}
						onKeyDownCapture={(event) => {
							setKeyboard(true);
							dragged.current = false;
							if (event.key === "Escape") setActive(null);
							if (event.altKey && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
								event.preventDefault();
								const direction = event.key === "ArrowRight" ? 1 : -1;
								const index = active === null ? -1 : tabs.indexOf(active);
								setActive(tabs[(index + direction + tabs.length) % tabs.length] ?? null);
							}
						}}
					>
						<div className="study-home-zone">
							<div className="study-lights" aria-hidden="true"><i /><i /><i /></div>
							<button type="button" className="study-home" title="Home" aria-label="Home" aria-current={active === null ? "page" : undefined} onClick={() => setActive(null)}>
								{take !== "line" && <HomeGlyph grid={take === "attached" || take === "browser"} />}
								{(take === "line" || take === "sidebar" || take === "browser") && <span>Home</span>}
							</button>
						</div>
						<LayoutGroup id={group}>
							<Reorder.Group as="div" ref={scroller} axis="x" values={tabs} onReorder={setTabs} layoutScroll className="study-tabs" aria-label="Open projects">
								<AnimatePresence initial={false} mode="popLayout">
									{tabs.map((name) => (
										<Reorder.Item
											as="div" key={name} value={name} layout="position" className={cn("study-tab", active === name && "is-active")}
											initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
											onPointerDown={() => { dragged.current = false; }} onDragStart={() => { dragged.current = true; dragging.current = true; }} onDragEnd={() => { dragging.current = false; }}
											whileDrag={{ zIndex: 10 }} dragElastic={0.05} dragMomentum={false}
										>
											{active === name && <motion.div className="study-selection" layoutId="selection" transition={{ duration, ease: [0.23, 1, 0.32, 1] }} />}
											<button type="button" className="study-tab-label" aria-current={active === name ? "page" : undefined} title={name} onClick={() => { if (!dragged.current) setActive(name); }}>
												{(take === "attached" || take === "browser") && <FileGlyph />}
												<span>{name}</span>
											</button>
											<button type="button" className="study-close" aria-label={`Close ${name}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => close(name)}><CrossGlyph /></button>
										</Reorder.Item>
									))}
								</AnimatePresence>
							</Reorder.Group>
							<motion.button layout="position" type="button" className="study-plus" aria-label="Open another project" onClick={open}><CrossGlyph plus /></motion.button>
						</LayoutGroup>
						<div className="study-header-space" />
						{active !== null && <span className="study-zoom">72%</span>}
					</header>
					<div className="study-content min-h-0 flex-1">
						{active === null ? <SpoolHomeScreen /> : <SpoolCanvasScreen variant="rest" />}
					</div>
				</div>
				<div className="flex shrink-0 items-baseline justify-between gap-5 pt-4">
					<p className="text-[13px] text-muted"><span className="mr-3 font-medium text-text">{caption.title}</span>{caption.note}</p>
					<p className="shrink-0 text-[12px] text-muted">Click, drag, close, or add a tab.</p>
				</div>
			</div>
		</MotionConfig>
	);
}

function HomeGlyph({ grid }: { grid: boolean }) {
	return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" aria-hidden="true">{grid ? <><rect x="3" y="3" width="5.5" height="5.5" rx="1" /><rect x="11.5" y="3" width="5.5" height="5.5" rx="1" /><rect x="3" y="11.5" width="5.5" height="5.5" rx="1" /><rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1" /></> : <path d="m3.5 8 6.5-5.5L16.5 8v9h-5v-5h-3v5h-5Z" />}</svg>;
}

function CrossGlyph({ plus = false }: { plus?: boolean }) {
	return <svg width={plus ? 14 : 10} height={plus ? 14 : 10} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true"><path d={plus ? "M6 1.5v9M1.5 6h9" : "m3 3 6 6m0-6L3 9"} /></svg>;
}

function FileGlyph() {
	return <svg width="14" height="16" viewBox="0 0 14 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 1.5h5l4 4v9h-9Zm5 0v4h4" /></svg>;
}
