import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";

/**
 * Tidemark's marketing page: the thing being played on the `play-tab` page.
 *
 * It is here rather than in one frame folder because all four chrome proposals
 * have to sit on the identical page — the variable under test is spool's chrome,
 * so the page underneath must be the constant. It takes props and no knowledge:
 * `cap` is the only thing the frames disagree about.
 *
 * Tidemark is a made-up product and wears its own palette the way kaffe does:
 * one paper, one panel, one line, one ink, one grey, one accent, and Instrument
 * Sans. The document's mono face is the only thing it shares with spool, so
 * anything on top of this page that is red or set in Familjen Grotesk is
 * legibly not part of the page.
 *
 * The last screen of the page is deliberate: a call to action button sitting
 * close to the bottom edge, then a four column footer, then a bottom row. That
 * is the part any bottom-anchored chrome has to survive, and the page bottom is
 * exactly what the reader is looking at when the chrome is at its most in the
 * way.
 */

const PAPER = "bg-[#0A0A0B]";
const LINE = "border-[#232326]";

export function TidemarkLanding({ cap }: { cap?: number | undefined }) {
	return (
		<div className={cn("h-full w-full overflow-hidden font-[Instrument_Sans] text-[#F5F5F4]", PAPER)}>
			<Nav cap={cap} />
			<Hero cap={cap} />
			<Users cap={cap} />
			<Steps cap={cap} />
			<Pages cap={cap} />
			<Quote cap={cap} />
			<Cta cap={cap} />
			<Footer cap={cap} />
		</div>
	);
}

function Row({ cap, className, children }: { cap?: number | undefined; className?: string | undefined; children: ReactNode }) {
	return (
		<div
			className={cn("mx-auto w-full px-16", className)}
			style={cap === undefined ? undefined : { maxWidth: cap }}
		>
			{children}
		</div>
	);
}

/* ------------------------------------------------------------------ nav ---- */

function Nav({ cap }: { cap?: number | undefined }) {
	const links = ["Product", "Changelog", "Docs", "Pricing"];
	return (
		<div className={cn("border-b", LINE)}>
			<Row cap={cap} className="flex h-[76px] items-center">
				<Wordmark />
				<nav className="ml-14 flex items-center gap-8">
					{links.map((link) => (
						<span key={link} className="text-[#8B8B90] text-[14px] leading-none">
							{link}
						</span>
					))}
				</nav>
				<div className="ml-auto flex items-center gap-6">
					<span className="text-[#8B8B90] text-[14px] leading-none">Sign in</span>
					<span className="flex h-9 items-center rounded-md bg-[#F5F5F4] px-4 font-medium text-[#0A0A0B] text-[14px] leading-none">
						Start free
					</span>
				</div>
			</Row>
		</div>
	);
}

function Wordmark() {
	return (
		<span className="flex items-center gap-2.5">
			<span className="flex h-[18px] w-[18px] flex-col justify-between">
				<span className="block h-[2px] w-full rounded-full bg-[#5CE0B0]" />
				<span className="block h-[2px] w-[13px] rounded-full bg-[#5CE0B0] opacity-60" />
				<span className="block h-[2px] w-[8px] rounded-full bg-[#5CE0B0] opacity-30" />
			</span>
			<span className="font-semibold text-[17px] tracking-tight leading-none">tidemark</span>
		</span>
	);
}

/* ----------------------------------------------------------------- hero ---- */

function Hero({ cap }: { cap?: number | undefined }) {
	return (
		<Row cap={cap} className="pt-[104px] pb-[112px]">
			<h1 className="max-w-[820px] text-balance font-semibold text-[62px] tracking-[-0.03em] leading-[66px]">
				Release notes your customers actually read.
			</h1>
			<p className="mt-7 max-w-[560px] text-[#8B8B90] text-[18px] leading-[28px]">
				Tidemark turns merged pull requests into a changelog you can publish in one click. It reads the diff, drafts
				the entry, and then waits for you to say ship.
			</p>
			<div className="mt-10 flex items-center gap-3">
				<span className="flex h-11 items-center rounded-md bg-[#F5F5F4] px-5 font-medium text-[#0A0A0B] text-[15px] leading-none">
					Start free
				</span>
				<span className={cn("flex h-11 items-center rounded-md border px-5 text-[15px] leading-none", LINE)}>
					See a live changelog
				</span>
			</div>
			<div className="mt-16">
				<DraftPanel />
			</div>
		</Row>
	);
}

/** The product still. A drafts queue on the left, the entry it wrote on the right. */
function DraftPanel() {
	const queue = [
		{ id: "#4127", title: "Group entries by product area", meta: "merged 14 min ago", live: true },
		{ id: "#4119", title: "Retry webhook delivery for 24h", meta: "merged 1 h ago" },
		{ id: "#4108", title: "Fix timezone drift on scheduled posts", meta: "merged 3 h ago" },
		{ id: "#4102", title: "Bump minimum Node to 22", meta: "merged yesterday" },
	];
	return (
		<div className={cn("overflow-hidden rounded-xl border bg-[#121214]", LINE)}>
			<div className={cn("flex h-12 items-center gap-6 border-b px-5", LINE)}>
				<span className="flex items-center gap-2 text-[14px] leading-none">
					Drafts
					<span className="flex h-[18px] items-center rounded-full bg-[#5CE0B0] px-1.5 font-medium text-[#0A0A0B] text-[11px] leading-none">
						4
					</span>
				</span>
				<span className="text-[#8B8B90] text-[14px] leading-none">Published</span>
				<span className="text-[#8B8B90] text-[14px] leading-none">Subscribers</span>
				<span className="ml-auto flex h-8 items-center rounded-md bg-[#F5F5F4] px-3.5 font-medium text-[#0A0A0B] text-[13px] leading-none">
					Publish 4
				</span>
			</div>
			<div className="flex">
				<div className={cn("w-[356px] shrink-0 border-r py-2", LINE)}>
					{queue.map((row) => (
						<div
							key={row.id}
							className={cn("mx-2 flex flex-col gap-1.5 rounded-lg px-3 py-3", row.live === true && "bg-[#1A1A1D]")}
						>
							<span className="flex items-center gap-2">
								{row.live === true && <span className="h-[6px] w-[6px] rounded-full bg-[#5CE0B0]" />}
								<span className="truncate text-[14px] leading-none">{row.title}</span>
							</span>
							<span className="pl-0 font-mono text-[#6E6E73] text-[12px] leading-none">
								{row.id} · {row.meta}
							</span>
						</div>
					))}
				</div>
				<div className="min-w-0 flex-1 px-8 py-7">
					<div className="flex items-center gap-3">
						<span className={cn("flex h-[22px] items-center rounded-full border px-2.5 font-mono text-[11px] leading-none", LINE)}>
							v2.14.0
						</span>
						<span className="text-[#6E6E73] text-[13px] leading-none">Draft, written 14 minutes ago</span>
					</div>
					<h3 className="mt-5 font-semibold text-[26px] tracking-tight leading-[30px]">
						Entries now group by product area
					</h3>
					<p className="mt-3.5 max-w-[520px] text-[#8B8B90] text-[15px] leading-[24px]">
						A changelog with forty entries in it stopped being readable somewhere around entry twelve. Entries now
						collect under the area they touched, and readers can follow one area instead of all of them.
					</p>
					<div className="mt-6 flex flex-col gap-2.5">
						{["Editor", "Webhooks", "Public pages"].map((tag) => (
							<span key={tag} className="flex items-center gap-2.5 text-[14px] leading-none">
								<span className="h-[2px] w-3 bg-[#5CE0B0]" />
								<span className="text-[#8B8B90]">{tag}</span>
							</span>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

/* ---------------------------------------------------------------- users ---- */

function Users({ cap }: { cap?: number | undefined }) {
	const names = ["Northbeam", "Harbor", "Cadence", "Loomis", "Fieldkit", "Brightsea"];
	return (
		<div className={cn("border-y", LINE)}>
			<Row cap={cap} className="flex h-[92px] items-center gap-12">
				<span className="text-[#6E6E73] text-[13px] leading-none">In use at</span>
				<span className="flex items-center gap-11">
					{names.map((name) => (
						<span key={name} className="font-medium text-[#8B8B90] text-[16px] tracking-tight leading-none">
							{name}
						</span>
					))}
				</span>
			</Row>
		</div>
	);
}

/* ---------------------------------------------------------------- steps ---- */

function Steps({ cap }: { cap?: number | undefined }) {
	const steps = [
		{
			n: "01",
			title: "It reads the pull request",
			body: "Every merge is parsed for what actually changed: the diff, the title, and the argument in the comments under it.",
		},
		{
			n: "02",
			title: "It writes the entry",
			body: "A draft lands in your changelog within a minute, in your voice, grouped the way your team already groups work.",
		},
		{
			n: "03",
			title: "You decide what ships",
			body: "Nothing publishes on its own. Edit it, fold two entries into one, or drop it and no one ever knows it existed.",
		},
	];
	return (
		<Row cap={cap} className="grid grid-cols-3 gap-16 py-[104px]">
			{steps.map((step) => (
				<div key={step.n} className={cn("border-t pt-7", LINE)}>
					<span className="font-mono text-[#5CE0B0] text-[13px] leading-none">{step.n}</span>
					<h2 className="mt-5 font-semibold text-[22px] tracking-tight leading-[26px]">{step.title}</h2>
					<p className="mt-3 text-[#8B8B90] text-[15px] leading-[24px]">{step.body}</p>
				</div>
			))}
		</Row>
	);
}

/* ---------------------------------------------------------------- pages ---- */

function Pages({ cap }: { cap?: number | undefined }) {
	const points = [
		"Your domain, your type, your colours.",
		"An RSS feed and an email list that fill themselves.",
		"One embed for the in-app what is new panel.",
	];
	return (
		<Row cap={cap} className="pb-[104px]">
			<div className={cn("grid grid-cols-[440px_1fr] gap-20 rounded-xl border bg-[#0E0E10] p-14", LINE)}>
				<div>
					<h2 className="font-semibold text-[38px] tracking-[-0.02em] leading-[42px]">
						Your changelog, on your own domain.
					</h2>
					<p className="mt-5 text-[#8B8B90] text-[16px] leading-[26px]">
						Published entries land on a page you own at changelog.yourdomain.com. It is a real page with real
						typography, not an iframe in someone else's product.
					</p>
					<div className="mt-8 flex flex-col gap-3.5">
						{points.map((point) => (
							<span key={point} className="flex items-start gap-3 text-[15px] leading-[22px]">
								<svg viewBox="0 0 14 14" className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#5CE0B0]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
									<path d="m2.5 7.5 3 3 6-7" />
								</svg>
								<span className="text-[#8B8B90]">{point}</span>
							</span>
						))}
					</div>
				</div>
				<div className={cn("overflow-hidden rounded-lg border bg-[#0A0A0B]", LINE)}>
					<div className={cn("flex h-11 items-center gap-2.5 border-b px-5", LINE)}>
						<Wordmark />
						<span className="ml-auto font-mono text-[#6E6E73] text-[12px] leading-none">
							changelog.harbor.com
						</span>
					</div>
					<div className="flex flex-col gap-7 px-9 py-8">
						{[
							{
								date: "31 July 2026",
								title: "Entries now group by product area",
								body: "Follow one area instead of all of them. Readers pick what they get emailed about.",
							},
							{
								date: "24 July 2026",
								title: "Webhook deliveries retry for a full day",
								body: "A receiver that was down for an afternoon no longer loses the release it missed.",
							},
							{
								date: "16 July 2026",
								title: "Scheduled posts respect your timezone",
								body: "Nine in the morning means nine where you are, which is what everybody assumed.",
							},
						].map((entry) => (
							<div key={entry.title} className="flex gap-8">
								<span className="w-[104px] shrink-0 pt-[3px] font-mono text-[#6E6E73] text-[12px] leading-none">
									{entry.date}
								</span>
								<span className="min-w-0">
									<span className="block font-semibold text-[17px] tracking-tight leading-[22px]">
										{entry.title}
									</span>
									<span className="mt-2 block text-[#8B8B90] text-[14px] leading-[22px]">{entry.body}</span>
								</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</Row>
	);
}

/* ---------------------------------------------------------------- quote ---- */

function Quote({ cap }: { cap?: number | undefined }) {
	return (
		<Row cap={cap} className="pb-[104px]">
			<blockquote className={cn("border-t pt-12", LINE)}>
				<p className="max-w-[900px] text-balance font-medium text-[32px] tracking-[-0.02em] leading-[42px]">
					“We stopped writing release notes on Friday afternoons. That was the entire pitch, and it turned out to be
					the entire product.”
				</p>
				<footer className="mt-7 flex items-center gap-3 text-[14px] leading-none">
					<span className="h-8 w-8 rounded-full bg-[#232326]" />
					<span>Nils Aronsson</span>
					<span className="text-[#6E6E73]">Head of engineering, Harbor</span>
				</footer>
			</blockquote>
		</Row>
	);
}

/* ------------------------------------------------------------------ cta ---- */

function Cta({ cap }: { cap?: number | undefined }) {
	return (
		<div className={cn("border-y bg-[#0E0E10]", LINE)}>
			<Row cap={cap} className="flex flex-col items-center py-[88px] text-center">
				<h2 className="max-w-[720px] text-balance font-semibold text-[44px] tracking-[-0.02em] leading-[50px]">
					Your next release can announce itself.
				</h2>
				<p className="mt-5 max-w-[520px] text-[#8B8B90] text-[16px] leading-[26px]">
					Connect a repository and the first draft is waiting for you before the deploy finishes. Free while your
					team is under ten people.
				</p>
				<div className="mt-9 flex items-center gap-3">
					<span className="flex h-12 items-center rounded-md bg-[#F5F5F4] px-6 font-medium text-[#0A0A0B] text-[15px] leading-none">
						Start free
					</span>
					<span className={cn("flex h-12 items-center rounded-md border px-6 text-[15px] leading-none", LINE)}>
						Book a walkthrough
					</span>
				</div>
			</Row>
		</div>
	);
}

/* --------------------------------------------------------------- footer ---- */

function Footer({ cap }: { cap?: number | undefined }) {
	const columns = [
		{ head: "Product", links: ["Overview", "Public pages", "Integrations", "Pricing"] },
		{ head: "Developers", links: ["Docs", "API reference", "GitHub app", "Status"] },
		{ head: "Company", links: ["About", "Careers", "Writing", "Contact"] },
		{ head: "Legal", links: ["Privacy", "Terms", "Security", "Data processing"] },
	];
	return (
		<Row cap={cap} className="pt-[72px] pb-8">
			<div className="grid grid-cols-[1fr_repeat(4,180px)] gap-10">
				<div>
					<Wordmark />
					<p className="mt-4 max-w-[240px] text-[#6E6E73] text-[14px] leading-[22px]">
						The changelog that writes its own first draft.
					</p>
				</div>
				{columns.map((column) => (
					<div key={column.head} className="flex flex-col gap-3.5">
						<span className="font-medium text-[14px] leading-none">{column.head}</span>
						{column.links.map((link) => (
							<span key={link} className="text-[#8B8B90] text-[14px] leading-none">
								{link}
							</span>
						))}
					</div>
				))}
			</div>
			<div className={cn("mt-14 flex items-center gap-6 border-t pt-6", LINE)}>
				<span className="text-[#6E6E73] text-[13px] leading-none">© 2026 Tidemark AB, Stockholm</span>
				<span className="flex items-center gap-2 text-[#6E6E73] text-[13px] leading-none">
					<span className="h-[6px] w-[6px] rounded-full bg-[#5CE0B0]" />
					All systems normal
				</span>
			</div>
		</Row>
	);
}
