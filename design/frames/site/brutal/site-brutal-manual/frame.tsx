import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool-mark";

/**
 * site-brutal--manual. The landing as spool's own manual page.
 *
 * The argument: a tool that ships a `spool skill` contract should introduce
 * itself in the same register. So the page is a man page, whole — a running
 * header, hanging-indent sections in a fixed left column, a table of commands, a
 * FILES tree, and the dated footer line. Nothing is centered, nothing is
 * decorated, and the only display type is the NAME line, which is large because
 * in a page set at 14px mono a 44px line is the loudest thing available.
 *
 * The index on the right is the one concession to a screen: a man page in less
 * has no table of contents, and a page you scroll with a mouse needs one. It
 * tracks the scroll and moves with it.
 */

const SECTIONS = [
	{ id: "name", label: "NAME" },
	{ id: "synopsis", label: "SYNOPSIS" },
	{ id: "description", label: "DESCRIPTION" },
	{ id: "install", label: "INSTALL" },
	{ id: "first-run", label: "FIRST RUN" },
	{ id: "commands", label: "COMMANDS" },
	{ id: "files", label: "FILES" },
	{ id: "demo", label: "DEMO" },
	{ id: "requirements", label: "REQUIREMENTS" },
	{ id: "dogfood", label: "DOGFOOD" },
	{ id: "license", label: "LICENSE" },
	{ id: "status", label: "STATUS" },
	{ id: "bugs", label: "BUGS" },
] as const;

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

/* ---------- pieces ---------- */

function Rule({ className }: { className?: string }) {
	return <div className={cn("h-px w-full bg-border", className)} />;
}

function Section({
	id,
	label,
	children,
	registry,
}: {
	id: string;
	label: string;
	children: React.ReactNode;
	registry: React.MutableRefObject<Map<string, HTMLElement>>;
}) {
	const bind = useCallback(
		(node: HTMLElement | null) => {
			if (node) registry.current.set(id, node);
			else registry.current.delete(id);
		},
		[id, registry],
	);

	return (
		<section ref={bind} data-section={id} className="flex gap-[24px] pt-[52px]">
			<h2 className="w-[128px] shrink-0 pt-[3px] text-[12px] leading-[20px] tracking-[0.06em] text-muted">
				{label}
			</h2>
			<div className="min-w-0 flex-1">{children}</div>
		</section>
	);
}

function Prose({ children, className }: { children: React.ReactNode; className?: string }) {
	return <p className={cn("max-w-[640px] text-[14px] leading-[25px] text-text", className)}>{children}</p>;
}

function CommandLine({ command }: { command: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	return (
		<button
			type="button"
			onClick={() => {
				void copyText(command).then((ok) => {
					if (!ok) return;
					setCopied(true);
					if (timer.current !== null) window.clearTimeout(timer.current);
					timer.current = window.setTimeout(() => setCopied(false), 1400);
				});
			}}
			className="group flex w-full max-w-[640px] cursor-pointer items-center gap-[12px] border border-border bg-canvas px-[16px] py-[13px] text-left transition-colors duration-150 hover:border-border-raised hover:bg-surface focus-visible:outline-none"
		>
			<span className="select-none text-[14px] leading-[20px] text-thread">$</span>
			<span className="flex-1 text-[14px] leading-[20px] text-text">{command}</span>
			<span
				className={cn(
					"select-none text-[11px] leading-[20px] tracking-[0.04em] transition-colors duration-150",
					copied ? "text-thread" : "text-muted opacity-0 group-hover:opacity-100",
				)}
			>
				{copied ? "copied" : "copy"}
			</span>
		</button>
	);
}

function Row({
	left,
	right,
	note,
}: {
	left: string;
	right: string;
	note?: string;
}) {
	return (
		<div className="group flex items-baseline gap-[20px] border-b border-border py-[9px] transition-colors duration-150 last:border-b-0 hover:bg-surface">
			<span className="w-[168px] shrink-0 text-[13px] leading-[20px] text-text">{left}</span>
			<span className="min-w-0 flex-1 text-[13px] leading-[20px] text-muted">{right}</span>
			{note ? <span className="shrink-0 text-[11px] leading-[20px] text-muted">{note}</span> : null}
		</div>
	);
}

function PlayBox() {
	const [hot, setHot] = useState(false);
	return (
		<div className="max-w-[720px]">
			<button
				type="button"
				onMouseEnter={() => setHot(true)}
				onMouseLeave={() => setHot(false)}
				className="relative flex aspect-[16/9] w-full cursor-pointer items-center justify-center border border-border bg-canvas transition-colors duration-200 hover:border-border-raised focus-visible:outline-none"
				style={{
					backgroundImage:
						"repeating-linear-gradient(135deg, transparent 0 13px, color-mix(in srgb, var(--color-text) 3%, transparent) 13px 14px)",
				}}
			>
				<span
					className={cn(
						"flex h-[52px] w-[52px] items-center justify-center border transition-colors duration-200",
						hot ? "border-thread bg-thread" : "border-border-raised bg-transparent",
					)}
				>
					<svg viewBox="0 0 12 14" className="h-[15px] w-[13px]" aria-hidden="true">
						<path
							d="M1 1.2 11 7 1 12.8Z"
							fill={hot ? "var(--color-on-thread)" : "var(--color-thread)"}
						/>
					</svg>
				</span>
				<span className="absolute bottom-[12px] left-[14px] text-[11px] leading-[16px] text-muted">
					get-started.mp4
				</span>
				<span className="absolute right-[14px] bottom-[12px] text-[11px] leading-[16px] text-muted">0:41</span>
			</button>
			<p className="pt-[10px] text-[12px] leading-[20px] text-muted">
				An empty folder, one command, and a frame on the canvas. No narration.
			</p>
		</div>
	);
}

/* ---------- the page ---------- */

export default function SiteBrutalManual() {
	const scroller = useRef<HTMLDivElement | null>(null);
	const registry = useRef<Map<string, HTMLElement>>(new Map());
	const [active, setActive] = useState<string>("name");

	useEffect(() => {
		const el = scroller.current;
		if (!el) return;
		let raf = 0;
		const read = () => {
			raf = 0;
			let current = SECTIONS[0].id as string;
			const top = el.getBoundingClientRect().top + 132;
			for (const s of SECTIONS) {
				const node = registry.current.get(s.id);
				if (node && node.getBoundingClientRect().top <= top) current = s.id;
			}
			setActive(current);
		};
		const onScroll = () => {
			if (raf === 0) raf = window.requestAnimationFrame(read);
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		read();
		return () => {
			el.removeEventListener("scroll", onScroll);
			if (raf !== 0) window.cancelAnimationFrame(raf);
		};
	}, []);

	const goto = (id: string) => {
		const node = registry.current.get(id);
		const el = scroller.current;
		if (!node || !el) return;
		el.scrollTo({ top: node.offsetTop - 64, behavior: "smooth" });
	};

	return (
		<div ref={scroller} className="h-full overflow-y-auto bg-bg font-mono text-text">
			{/* running header, the way a man page opens */}
			<div className="sticky top-0 z-20 bg-bg">
				<div className="flex items-baseline justify-between px-[64px] pt-[22px] pb-[14px] text-[11px] leading-[16px] tracking-[0.08em] text-muted">
					<span>SPOOL(1)</span>
					<span>General Commands Manual</span>
					<span>SPOOL(1)</span>
				</div>
				<Rule />
			</div>

			<div className="flex px-[64px]">
				<main className="min-w-0 flex-1 pr-[64px] pb-[120px]">
					<Section id="name" label="NAME" registry={registry}>
						<div className="flex items-center gap-[18px]">
							<SpoolMark className="h-[46px] w-[36px] shrink-0 text-thread" title="spool" />
							<span className="text-[44px] leading-[48px] tracking-[-0.03em] text-text">spool</span>
						</div>
						<p className="pt-[16px] text-[15px] leading-[24px] text-muted">
							a canvas where the frames are alive
						</p>
					</Section>

					<Section id="synopsis" label="SYNOPSIS" registry={registry}>
						<div className="space-y-[6px] text-[14px] leading-[24px]">
							{[
								["npm i -g", "spool.page"],
								["spool", "init [path]"],
								["spool", "open [path]"],
								["spool", "serve | status | stop"],
								["spool", "shot <frame>"],
								["spool", "skill [topic]"],
							].map(([head, tail]) => (
								<div key={`${head} ${tail}`} className="flex gap-[10px]">
									<span className="select-none text-muted">$</span>
									<span className="text-text">
										{head} <span className="text-muted">{tail}</span>
									</span>
								</div>
							))}
						</div>
					</Section>

					<Section id="description" label="DESCRIPTION" registry={registry}>
						<Prose>
							I made this for myself. I wanted to see a screen behave before I built it, and I
							wanted the agent writing it to be able to check its own work.
						</Prose>
						<Prose className="pt-[18px]">
							A frame is a TSX file in <span className="text-thread">design/</span> that
							default-exports one component. Write the file and it is on the canvas, live: real
							inputs, real state, real motion. Arrange the frames spatially, link them into flows,
							then press play and walk the thing like an app.
						</Prose>
						<Prose className="pt-[18px]">
							Code is the document. The canvas is a projection of it, so git owns the history and
							the whole design space is a folder inside the product repo. It runs on your machine.
						</Prose>
					</Section>

					<Section id="install" label="INSTALL" registry={registry}>
						<CommandLine command="npm i -g spool.page" />
						<div className="max-w-[640px] pt-[10px] text-[12px] leading-[20px] text-muted">
							If your npm blocks install scripts:{" "}
							<span className="text-text">npm i -g spool.page --allow-scripts=esbuild</span>
						</div>
						<div className="max-w-[640px] pt-[26px]">
							<Rule />
							<div className="flex items-center justify-between py-[13px]">
								<div>
									<div className="text-[13px] leading-[20px] text-text">Or take the Mac app.</div>
									<div className="pt-[3px] text-[12px] leading-[18px] text-muted">
										Spool.dmg · a window on the same daemon
									</div>
								</div>
								<button
									type="button"
									className="cursor-pointer border border-border-raised px-[14px] py-[7px] text-[12px] leading-[18px] text-text transition-colors duration-150 hover:border-thread hover:text-thread focus-visible:outline-none"
								>
									download
								</button>
							</div>
							<Rule />
						</div>
					</Section>

					<Section id="first-run" label="FIRST RUN" registry={registry}>
						<Prose>
							The first run opens an empty canvas and says so. Press{" "}
							<span className="text-thread">+</span>, point it at any folder on disk, and that
							folder becomes a project. Point it at several and they all stay open, each with its
							own canvas.
						</Prose>
						<div className="mt-[22px] flex max-w-[640px] items-center gap-[14px] border border-border bg-canvas px-[16px] py-[14px]">
							<span className="flex h-[22px] w-[22px] items-center justify-center border border-border-raised text-[13px] leading-[20px] text-thread">
								+
							</span>
							<span className="text-[13px] leading-[20px] text-muted">no frames yet</span>
						</div>
					</Section>

					<Section id="commands" label="COMMANDS" registry={registry}>
						<div className="max-w-[720px] border-t border-border">
							<Row left="spool" right="open the canvas in your browser" note="--no-open prints the address" />
							<Row left="spool init [path]" right="scaffold design/ and register the project" />
							<Row left="spool open [path]" right="register a folder that already has one" />
							<Row left="spool remove [path]" right="forget a project, keep every file" />
							<Row left="spool shot <frame>" right="headless screenshot, for the agent" />
							<Row left="spool logs <frame>" right="that frame's console, same boot" />
							<Row left="spool flows" right="the link graph, read from source" />
							<Row left="spool skill [topic]" right="the complete contract, printed" />
							<Row left="spool autostart" right="start at login" note="launchd, macOS" />
						</div>
					</Section>

					<Section id="files" label="FILES" registry={registry}>
						<div className="max-w-[640px] space-y-[5px] text-[13px] leading-[21px]">
							{[
								["design/frames/<name>/frame.tsx", "one default-exported component"],
								["design/frames/<name>/frame.json", "where it sits on the canvas"],
								["design/shared/ui/", "components more than one frame uses"],
								["design/shared/tokens.css", "the one token file"],
								["design/canvas.json", "spool's, never yours"],
							].map(([path, gloss]) => (
								<div key={path} className="flex gap-[16px]">
									<span className="w-[276px] shrink-0 text-text">{path}</span>
									<span className="text-muted">{gloss}</span>
								</div>
							))}
						</div>
						<Prose className="pt-[20px]">
							A file appearing on disk is a frame appearing on the canvas. That is the whole
							registration step, and it is why there is no <span className="text-text">spool new</span>.
						</Prose>
					</Section>

					<Section id="demo" label="DEMO" registry={registry}>
						<PlayBox />
					</Section>

					<Section id="requirements" label="REQUIREMENTS" registry={registry}>
						<div className="max-w-[720px] border-t border-border">
							<Row left="node" right="22 or newer" />
							<Row left="browser" right="Chrome" note="WebKit blurs transformed iframes" />
							<Row left="platform" right="macOS, Linux" note="Windows via WSL" />
							<Row left="network" right="none, after the install" />
						</div>
					</Section>

					<Section id="dogfood" label="DOGFOOD" registry={registry}>
						<div className="flex max-w-[720px] items-end gap-[56px] pb-[6px]">
							{[
								["162", "frames"],
								["13", "pages"],
								["1", "folder"],
							].map(([n, l]) => (
								<div key={l}>
									<div className="text-[46px] leading-[46px] tracking-[-0.03em] text-text">{n}</div>
									<div className="pt-[6px] text-[12px] leading-[18px] text-muted">{l}</div>
								</div>
							))}
						</div>
						<Prose className="pt-[22px]">
							Spool is designed in spool. Every screen of the product, every rejected take, and
							this manual page all live on the canvas in the repo's own{" "}
							<span className="text-thread">design/</span> folder, and the count above is what{" "}
							<span className="text-text">find design/frames -name frame.tsx</span> printed this
							morning.
						</Prose>
					</Section>

					<Section id="license" label="LICENSE" registry={registry}>
						<div className="flex max-w-[640px] items-stretch">
							<div className="flex w-[76px] shrink-0 items-center justify-center bg-thread text-[15px] leading-[20px] text-on-thread">
								MIT
							</div>
							<div className="flex-1 border-y border-r border-border px-[18px] py-[14px]">
								<div className="text-[14px] leading-[22px] text-text">
									Fork it, rework it, rename it, ship it.
								</div>
								<div className="pt-[4px] text-[12px] leading-[19px] text-muted">
									It is a tool for designing things. Make it your own if you want to.
								</div>
							</div>
						</div>
					</Section>

					<Section id="status" label="STATUS" registry={registry}>
						<Prose>
							Pre-1.0: published, dogfooded daily, and still moving. Version{" "}
							<span className="text-text">0.12.0</span> is on npm right now, the shape of the
							canvas is settled, and the parts under it change most weeks.
						</Prose>
					</Section>

					<Section id="bugs" label="BUGS" registry={registry}>
						<Prose>
							Plenty. Open an issue and I will read it. If you don&apos;t like something, fork it.
						</Prose>
						<div className="flex gap-[10px] pt-[20px]">
							{["github.com/liamvinberg/spool", "spool skill"].map((t) => (
								<span
									key={t}
									className="cursor-pointer border border-border px-[12px] py-[7px] text-[12px] leading-[18px] text-muted transition-colors duration-150 hover:border-border-raised hover:text-text"
								>
									{t}
								</span>
							))}
						</div>
					</Section>

					<div className="pt-[64px]">
						<Rule />
						<div className="flex items-baseline justify-between pt-[14px] text-[11px] leading-[16px] tracking-[0.08em] text-muted">
							<span>spool.page 0.12.0</span>
							<span>2026-09-01</span>
							<span>SPOOL(1)</span>
						</div>
					</div>
				</main>

				{/* the index, which a real man page does not have and a scrolled one needs */}
				<nav className="sticky top-[53px] h-[847px] w-[212px] shrink-0 border-l border-border pt-[52px] pl-[24px]">
					{SECTIONS.map((s, i) => {
						const on = s.id === active;
						return (
							<button
								key={s.id}
								type="button"
								onClick={() => goto(s.id)}
								className="group flex w-full cursor-pointer items-baseline gap-[12px] py-[4px] text-left focus-visible:outline-none"
							>
								<span
									className={cn(
										"text-[11px] leading-[18px] tabular-nums transition-colors duration-150",
										on ? "text-thread" : "text-muted/60",
									)}
								>
									{String(i + 1).padStart(2, "0")}
								</span>
								<span
									className={cn(
										"text-[11px] leading-[18px] tracking-[0.05em] transition-colors duration-150",
										on ? "text-text" : "text-muted group-hover:text-text",
									)}
								>
									{s.label}
								</span>
							</button>
						);
					})}
					<div className="absolute right-0 bottom-[26px] left-[24px]">
						<Rule />
						<button
							type="button"
							onClick={() => {
								void copyText("npm i -g spool.page");
							}}
							className="group flex w-full cursor-pointer items-baseline gap-[8px] py-[12px] text-left focus-visible:outline-none"
						>
							<span className="text-[11px] leading-[18px] text-thread">$</span>
							<span className="text-[11px] leading-[18px] text-text">npm i -g spool.page</span>
						</button>
						<Rule />
						<div className="pt-[12px] text-[11px] leading-[18px] text-muted">
							<div className="text-text">spool.page</div>
							<div className="pt-[2px]">0.12.0 · MIT · pre-1.0</div>
						</div>
					</div>
				</nav>
			</div>
		</div>
	);
}
