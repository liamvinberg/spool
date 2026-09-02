import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool-mark";

/**
 * site-brutal--session. The landing as the session you would have had anyway.
 *
 * The argument: every claim a landing page makes about a CLI is a claim about
 * what the CLI prints. So the page prints it. The whole left side is one shell
 * transcript from an empty folder to a live frame, and the marketing copy is
 * either machine output (lowercase mono, verbatim) or a comment the human typed
 * into their own session (`#`, sentence case, first person). Nothing is asserted
 * in a voice the terminal does not have.
 *
 * The gutter carries elapsed time, so the page's real claim — the loop is short
 * — is legible without anyone writing the word "fast". 00:00 to a frame on the
 * canvas at 00:24.
 *
 * The dock on the right is the one thing that is not the session: install, the
 * app, what it needs, where the source is. A transcript scrolls away from its
 * own first line and the install line is the page's call to action, so it also
 * lives somewhere that never moves.
 */

const CWD = "~/kaffe";

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

/* ---------- transcript primitives ---------- */

function Line({
	time,
	className,
	children,
}: {
	time?: string;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div className={cn("flex items-baseline", className)}>
			<span className="w-[72px] shrink-0 pr-[18px] text-right text-[11px] leading-[24px] text-muted/55 tabular-nums">
				{time ?? ""}
			</span>
			<div className="min-w-0 flex-1 pl-[22px] text-[14px] leading-[24px]">{children}</div>
		</div>
	);
}

function Cmd({
	time,
	cwd = CWD,
	command,
	arg,
	onClick,
	hint,
}: {
	time: string;
	cwd?: string;
	command: string;
	arg?: string;
	onClick?: () => void;
	hint?: string;
}) {
	const body = (
		<>
			<span className="select-none text-muted">{cwd} </span>
			<span className="select-none text-thread">$ </span>
			<span className="text-text">{command}</span>
			{arg ? <span className="text-muted"> {arg}</span> : null}
		</>
	);
	if (!onClick) return <Line time={time}>{body}</Line>;
	return (
		<Line time={time}>
			<button
				type="button"
				onClick={onClick}
				className="group -mx-[8px] block w-full cursor-pointer rounded-none px-[8px] text-left transition-colors duration-150 hover:bg-surface focus-visible:outline-none"
			>
				{body}
				<span className="pl-[14px] text-[11px] text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100">
					{hint}
				</span>
			</button>
		</Line>
	);
}

function Out({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
	return <Line>{<span className={dim ? "text-muted/70" : "text-muted"}>{children}</span>}</Line>;
}

/** the human talking inside their own session: the only sentence-case register. */
function Note({ children }: { children: React.ReactNode }) {
	return (
		<Line>
			<div className="flex max-w-[672px] gap-[9px]">
				<span className="shrink-0 text-thread">#</span>
				<span className="min-w-0 text-text">{children}</span>
			</div>
		</Line>
	);
}

function Gap({ h = 24 }: { h?: number }) {
	return <div style={{ height: h }} />;
}

/* ---------- the two set pieces the session prints ---------- */

function Banner() {
	return (
		<Line>
			<div className="flex items-center gap-[14px] py-[10px]">
				<SpoolMark className="h-[40px] w-[31px] shrink-0 text-thread" title="spool" />
				<div>
					<div className="text-[26px] leading-[30px] tracking-[-0.03em] text-text">spool 0.12.0</div>
					<div className="pt-[2px] text-[12px] leading-[18px] text-muted">
						a canvas where the frames are alive
					</div>
				</div>
			</div>
		</Line>
	);
}

function Figure() {
	const [hot, setHot] = useState(false);
	return (
		<Line>
			<button
				type="button"
				onMouseEnter={() => setHot(true)}
				onMouseLeave={() => setHot(false)}
				className="relative my-[8px] flex h-[300px] w-full max-w-[672px] cursor-pointer items-center justify-center border border-border bg-canvas transition-colors duration-200 hover:border-border-raised focus-visible:outline-none"
				style={{
					backgroundImage:
						"repeating-linear-gradient(135deg, transparent 0 15px, color-mix(in srgb, var(--color-text) 3%, transparent) 15px 16px)",
				}}
			>
				<span
					className={cn(
						"flex h-[54px] w-[54px] items-center justify-center border transition-colors duration-200",
						hot ? "border-thread bg-thread" : "border-border-raised bg-bg",
					)}
				>
					<svg viewBox="0 0 12 14" className="h-[16px] w-[14px]" aria-hidden="true">
						<path
							d="M1 1.2 11 7 1 12.8Z"
							fill={hot ? "var(--color-on-thread)" : "var(--color-thread)"}
						/>
					</svg>
				</span>
				<span className="absolute top-[14px] left-[16px] text-[11px] leading-[16px] text-muted">
					get-started.mp4
				</span>
				<span className="absolute right-[16px] bottom-[14px] text-[11px] leading-[16px] text-muted">
					0:41
				</span>
				<span className="absolute bottom-[14px] left-[16px] text-[11px] leading-[16px] text-muted">
					this session, unedited
				</span>
			</button>
		</Line>
	);
}

/* ---------- the dock ---------- */

function DockRule() {
	return <div className="h-px w-full bg-border" />;
}

function Dock() {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);
	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);
	const copy = () => {
		void copyText("npm i -g spool.page").then((ok) => {
			if (!ok) return;
			setCopied(true);
			if (timer.current !== null) window.clearTimeout(timer.current);
			timer.current = window.setTimeout(() => setCopied(false), 1400);
		});
	};

	return (
		<aside className="flex h-full w-[312px] shrink-0 flex-col border-l border-border bg-bg px-[24px] py-[26px]">
			<div className="flex items-center gap-[10px]">
				<SpoolMark className="h-[20px] w-[16px] shrink-0 text-thread" title="spool" />
				<span className="text-[16px] leading-[22px] tracking-[-0.02em] text-text">spool</span>
				<span className="ml-auto text-[11px] leading-[16px] text-muted">0.12.0</span>
			</div>

			<div className="pt-[22px]">
				<button
					type="button"
					onClick={copy}
					className="group flex w-full cursor-pointer items-center gap-[9px] border border-border-raised bg-canvas px-[13px] py-[11px] text-left transition-colors duration-150 hover:bg-surface focus-visible:outline-none"
				>
					<span className="select-none text-[13px] leading-[19px] text-thread">$</span>
					<span className="flex-1 text-[13px] leading-[19px] text-text">npm i -g spool.page</span>
					<span
						className={cn(
							"text-[10px] leading-[19px] transition-colors duration-150",
							copied ? "text-thread" : "text-muted opacity-0 group-hover:opacity-100",
						)}
					>
						{copied ? "copied" : "copy"}
					</span>
				</button>
				<p className="pt-[9px] text-[11px] leading-[17px] text-muted">
					If npm blocks install scripts, add
					<br />
					<span className="text-text">--allow-scripts=esbuild</span> to it.
				</p>
			</div>

			<div className="pt-[22px]">
				<DockRule />
				<div className="flex items-center justify-between py-[13px]">
					<div>
						<div className="text-[12px] leading-[18px] text-text">Mac app</div>
						<div className="pt-[1px] text-[11px] leading-[16px] text-muted">Spool.dmg</div>
					</div>
					<span className="cursor-pointer border border-border-raised px-[11px] py-[6px] text-[11px] leading-[16px] text-text transition-colors duration-150 hover:border-thread hover:text-thread">
						download
					</span>
				</div>
				<DockRule />
			</div>

			<div className="pt-[18px]">
				{[
					["node", "22 or newer"],
					["browser", "Chrome"],
					["platform", "macOS · Linux"],
					["windows", "WSL"],
					["license", "MIT"],
				].map(([k, v]) => (
					<div key={k} className="flex items-baseline justify-between py-[4px]">
						<span className="text-[11px] leading-[17px] text-muted">{k}</span>
						<span className="text-[11px] leading-[17px] text-text">{v}</span>
					</div>
				))}
			</div>

			<div className="pt-[22px]">
				<DockRule />
				<div className="pt-[16px] text-[11px] leading-[16px] text-muted">
					spool&apos;s own design/ folder
				</div>
				<div className="flex items-end gap-[26px] pt-[10px]">
					{[
						["162", "frames"],
						["13", "pages"],
					].map(([n, l]) => (
						<div key={l}>
							<div className="text-[30px] leading-[32px] tracking-[-0.03em] text-text">{n}</div>
							<div className="pt-[3px] text-[11px] leading-[16px] text-muted">{l}</div>
						</div>
					))}
				</div>
				<p className="pt-[12px] text-[11px] leading-[17px] text-muted">
					Spool is designed in spool. This page is one of the frames.
				</p>
			</div>

			<div className="mt-auto">
				<DockRule />
				<p className="pt-[14px] text-[11px] leading-[18px] text-text">
					MIT. Fork it, rework it, rename it, ship it.
				</p>
				<p className="pt-[6px] text-[11px] leading-[17px] text-muted">
					Pre-1.0: published, dogfooded daily, and still moving.
				</p>
				<div className="flex gap-[7px] pt-[16px]">
					{["github", "docs"].map((t) => (
						<span
							key={t}
							className="cursor-pointer border border-border px-[10px] py-[5px] text-[11px] leading-[16px] text-muted transition-colors duration-150 hover:border-border-raised hover:text-text"
						>
							{t}
						</span>
					))}
				</div>
			</div>
		</aside>
	);
}

/* ---------- the page ---------- */

export default function SiteBrutalSession() {
	const copyInstall = () => {
		void copyText("npm i -g spool.page");
	};

	return (
		<div className="flex h-full bg-bg font-mono text-text">
			<div className="relative min-w-0 flex-1 overflow-y-auto">
				{/* the gutter's hairline, running the whole transcript */}
				<div className="pointer-events-none absolute top-0 bottom-0 left-[72px] w-px bg-border" />

				<div className="py-[40px] pr-[40px]">
					<Cmd
						time="00:00"
						command="npm i -g"
						arg="spool.page"
						onClick={copyInstall}
						hint="click to copy"
					/>
					<Out>added 1 package in 3s</Out>
					<Gap />
					<Note>
						I made this for myself. I wanted to watch a screen behave before I committed to
						building it, and I wanted the agent writing it to be able to check its own work.
					</Note>
					<Gap />

					<Cmd time="00:06" command="spool" arg="init" />
					<Banner />
					<Out>scaffolded design/</Out>
					<Out>registered ~/kaffe</Out>
					<Out>
						canvas at <span className="text-text">http://localhost:7766</span>
					</Out>
					<Gap />

					<Cmd time="00:09" command="ls" arg="design/frames" />
					<Out dim>no frames yet</Out>
					<Gap />
					<Note>
						That is the whole first run. Press <span className="text-thread">+</span> in the canvas
						to point spool at another folder on disk, and that folder is a project too. I keep six
						open.
					</Note>
					<Gap />

					<Cmd time="00:14" command="agent" arg={'"draw the cart: three items, promo field, sticky total"'} />
					<Out>
						wrote <span className="text-text">design/frames/cart/frame.tsx</span>
					</Out>
					<Out>
						wrote <span className="text-text">design/frames/cart/frame.json</span>
					</Out>
					<Gap h={10} />
					<Cmd time="00:24" command="spool" arg="shot cart" />
					<Out>design/.spool/verify/cart.png</Out>
					<Gap />
					<Note>
						The file landing on disk is the frame landing on the canvas, live: real inputs, real
						state, real motion. That is the whole registration step. The agent takes its own
						screenshot and reads its own console, so it can tell whether what it wrote works.
					</Note>
					<Gap />

					<Cmd time="00:31" command="play" arg="get-started.mp4" />
					<Figure />
					<Gap />

					<Cmd time="01:02" command="spool" arg="status" />
					<Out>daemon running · pid 4127 · port 7766</Out>
					<Out>node v22.14.0</Out>
					<Out>browser Chrome (WebKit renders transformed iframes blurry)</Out>
					<Out>platform darwin (linux too; windows via wsl)</Out>
					<Out>projects 6 open</Out>
					<Gap />

					<Cmd time="01:20" cwd="~/spool" command="find" arg="design/frames -name frame.tsx | wc -l" />
					<Line>
						<span className="text-[38px] leading-[46px] tracking-[-0.03em] text-text">162</span>
					</Line>
					<Gap h={12} />
					<Cmd time="01:23" cwd="~/spool" command="ls" arg="design/frames" />
					<Out>
						agent app booting components directing dock explorer manipulate picker play-inline
						play-tab site variants
					</Out>
					<Gap />
					<Note>
						Spool is designed in spool. Thirteen pages of it: the product's own screens, every take
						that lost an argument, and the page you are reading. Code is the document, so git holds
						the history and the whole design space is a folder inside the repo.
					</Note>
					<Gap />

					<Cmd time="01:40" cwd="~/spool" command="head -1" arg="LICENSE.md" />
					<Out>MIT License</Out>
					<Gap />
					<Note>Fork it, rework it, rename it, ship it.</Note>
					<Gap />

					<Cmd time="01:44" command="npm view" arg="spool.page version" />
					<Out>0.12.0</Out>
					<Gap />
					<Note>Pre-1.0: published, dogfooded daily, and still moving.</Note>
					<Gap />

					<Line>
						<span className="select-none text-muted">{CWD} </span>
						<span className="select-none text-thread">$ </span>
						<span className="ml-[1px] inline-block h-[16px] w-[8px] translate-y-[2px] animate-pulse bg-text" />
					</Line>
					<Gap h={40} />
				</div>
			</div>
			<Dock />
		</div>
	);
}
