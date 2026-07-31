import { cn } from "../../../shared/lib/utils";

/**
 * The mock canvas behind the three play-inline prototypes: six frames of a
 * demo product (kaffe) laid out in world coordinates, plus the two cameras the
 * transition runs between. Copied per frame on purpose — this is a feel
 * prototype, so each variation owns its own copy and nothing here is shared.
 *
 * The frames are authored at real sizes and the canvas camera scales them, the
 * way the canvas actually works. That is the whole point: detail has to resolve
 * as the camera flies in, or the zoom is answering a question nobody asked.
 */

export interface WorldFrame {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

export const HERO = "admin";

export const WORLD: readonly WorldFrame[] = [
	{ name: "admin", x: 0, y: 0, w: 1120, h: 700 },
	{ name: "settings", x: 1240, y: -60, w: 520, h: 640 },
	{ name: "menu", x: 1240, y: 660, w: 640, h: 420 },
	{ name: "login", x: -560, y: 0, w: 440, h: 520 },
	{ name: "cart", x: -560, y: 620, w: 390, h: 620 },
	{ name: "hours", x: 200, y: 840, w: 360, h: 260 },
];

export const heroBox: WorldFrame = WORLD[0] as WorldFrame;

export interface Camera {
	readonly x: number;
	readonly y: number;
	readonly k: number;
}

/** Where the canvas sits when nothing is playing: the page fit under the 44px bar. */
export const REST: Camera = { x: 390, y: 177, k: 0.5 };

/**
 * Where the camera has to land for the hero to sit exactly where the player
 * draws it. `place()` in src/runtime/player-chrome.tsx is the rule copied
 * verbatim: 56px of stage across, 120px down, never above 100%.
 */
export function fit(box: WorldFrame, vw: number, vh: number): Camera {
	const k = Math.min(1, (vw - 56) / box.w, (vh - 120) / box.h);
	return {
		k,
		x: Math.round((vw - box.w * k) / 2) - box.x * k,
		y: Math.round((vh - box.h * k) / 2) - box.y * k,
	};
}

export const PLAY: Camera = fit(heroBox, 1440, 900);

export function MockScreen({ name }: { name: string }) {
	if (name === "admin") return <Admin />;
	if (name === "settings") return <Settings />;
	if (name === "menu") return <Menu />;
	if (name === "login") return <Login />;
	if (name === "cart") return <Cart />;
	return <Hours />;
}

/* ---------------------------------------------------------------- admin ---- */

const NAV = ["Orders", "Menu", "Staff", "Hours", "Settings"] as const;

const ORDERS = [
	{ id: "1042", who: "Ida Lund", items: "Cortado, Bulle", status: "Brewing", total: "80 kr", live: true },
	{ id: "1041", who: "Nils Ek", items: "Flat white", status: "Ready", total: "45 kr", live: true },
	{ id: "1040", who: "Sara Holm", items: "Bryggkaffe ×2", status: "Ready", total: "64 kr", live: true },
	{ id: "1039", who: "Tove Ask", items: "Havregrynsgröt", status: "Picked up", total: "52 kr", live: false },
	{ id: "1038", who: "Erik Dahl", items: "Kardemummasnurra, Bryggkaffe", status: "Picked up", total: "74 kr", live: false },
	{ id: "1037", who: "Maja Berg", items: "Cortado ×2", status: "Picked up", total: "84 kr", live: false },
	{ id: "1036", who: "Otto Rehn", items: "Flat white, Bulle", status: "Picked up", total: "83 kr", live: false },
	{ id: "1035", who: "Lova Sjö", items: "Bryggkaffe", status: "Picked up", total: "32 kr", live: false },
	{ id: "1034", who: "Anton Falk", items: "Cortado, Kardemummasnurra", status: "Picked up", total: "84 kr", live: false },
	{ id: "1033", who: "Elsa Grip", items: "Flat white ×2, Bulle", status: "Picked up", total: "128 kr", live: false },
	{ id: "1032", who: "Hugo Sten", items: "Havregrynsgröt, Bryggkaffe", status: "Picked up", total: "84 kr", live: false },
	{ id: "1031", who: "Vera Lind", items: "Cortado", status: "Picked up", total: "42 kr", live: false },
] as const;

function Admin() {
	return (
		<div className="flex h-full w-full font-sans text-text">
			<aside className="flex w-52 shrink-0 flex-col border-border border-r">
				<div className="flex h-14 items-center gap-2 px-5">
					<span className="h-[2px] w-2.5 bg-thread" />
					<span className="font-semibold text-md tracking-tight">kaffe</span>
				</div>
				<nav className="flex flex-col gap-0.5 px-3 py-2">
					{NAV.map((item) => {
						const active = item === "Orders";
						return (
							<span
								key={item}
								className={cn(
									"flex h-8 items-center gap-2 rounded-sm px-2.5 text-base leading-base",
									active ? "bg-surface text-text" : "text-muted",
								)}
							>
								{active ? <span className="h-[2px] w-2 bg-thread" /> : <span className="w-2" />}
								{item}
							</span>
						);
					})}
				</nav>
				<div className="mt-auto flex items-center gap-2.5 border-border border-t px-5 py-4">
					<span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted text-xs">IL</span>
					<span className="flex flex-col">
						<span className="text-base leading-tight">Ida Lund</span>
						<span className="text-muted text-xs leading-tight">Owner</span>
					</span>
				</div>
			</aside>
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="flex h-14 shrink-0 items-center gap-4 border-border border-b px-6">
					<h1 className="font-semibold text-lg tracking-tight">Orders</h1>
					<span className="flex h-7 items-center rounded-sm bg-surface px-2.5 text-base text-muted leading-base">
						Today
					</span>
					<div className="ml-auto flex h-8 w-64 items-center rounded-sm border border-border bg-surface px-3 text-muted text-base">
						Search orders
					</div>
					<span className="flex h-8 items-center rounded-sm border border-border px-3 text-base leading-base">
						Export
					</span>
				</header>
				<div className="flex min-h-0 flex-1">
					<section className="flex min-w-0 flex-1 flex-col px-6 py-4">
						<div className="flex items-center gap-4 border-border border-b pb-2.5 font-mono text-2xs text-muted leading-3">
							<span className="w-14">order</span>
							<span className="w-32">customer</span>
							<span className="min-w-0 flex-1">items</span>
							<span className="w-20">status</span>
							<span className="w-16 text-right">total</span>
						</div>
						<ul className="flex flex-col">
							{ORDERS.map((row) => (
								<li
									key={row.id}
									className={cn(
										"flex items-center gap-4 border-border/60 border-b py-3 text-base leading-base",
										row.id === "1042" && "bg-surface/60",
									)}
								>
									<span className="w-14 font-mono text-muted text-sm">#{row.id}</span>
									<span className="w-32 truncate">{row.who}</span>
									<span className={cn("min-w-0 flex-1 truncate", row.live ? "text-text" : "text-muted")}>
										{row.items}
									</span>
									<span className={cn("w-20", row.live ? "text-text" : "text-muted")}>{row.status}</span>
									<span className="w-16 text-right font-mono text-sm">{row.total}</span>
								</li>
							))}
						</ul>
						<p className="pt-4 text-muted text-sm leading-sm">Twelve orders today. Average wait is three minutes.</p>
					</section>
					<aside className="flex w-[300px] shrink-0 flex-col border-border border-l px-5 py-4">
						<div className="flex items-baseline gap-2">
							<span className="font-mono text-md">#1042</span>
							<span className="text-muted text-base">Ida Lund</span>
						</div>
						<p className="pt-1 text-muted text-sm leading-sm">Placed 11:04, counter pickup</p>
						<ul className="flex flex-col gap-2.5 pt-5">
							{[
								{ item: "Cortado", price: "42 kr" },
								{ item: "Bulle", price: "38 kr" },
							].map((line) => (
								<li key={line.item} className="flex items-center justify-between text-base leading-base">
									<span>{line.item}</span>
									<span className="font-mono text-sm text-muted">{line.price}</span>
								</li>
							))}
						</ul>
						<div className="mt-4 flex items-center justify-between border-border border-t pt-4 text-base">
							<span className="text-muted">Total</span>
							<span className="font-mono">80 kr</span>
						</div>
						<h2 className="pt-7 pb-3 text-muted text-sm leading-sm">Timeline</h2>
						<ul className="flex flex-col gap-3">
							{[
								{ at: "11:04", what: "Placed from the phone" },
								{ at: "11:05", what: "Accepted by Ida" },
								{ at: "11:06", what: "Brewing" },
							].map((step, i) => (
								<li key={step.at} className="flex items-baseline gap-3 text-base leading-base">
									<span className="font-mono text-muted text-sm">{step.at}</span>
									<span className={i === 2 ? "text-text" : "text-muted"}>{step.what}</span>
								</li>
							))}
						</ul>
						<label className="flex flex-col gap-2 pt-7">
							<span className="text-muted text-sm leading-sm">Note for the counter</span>
							<span className="flex h-16 items-start rounded-sm border border-border bg-surface px-3 py-2 text-muted text-base">
								Hand it over with a spoon.
							</span>
						</label>
						<div className="mt-auto flex flex-col gap-2 pt-6">
							<span className="flex h-9 items-center justify-center rounded-sm bg-thread font-medium text-base text-on-thread">
								Mark ready
							</span>
							<span className="flex h-9 items-center justify-center rounded-sm border border-border text-base text-muted">
								Refund
							</span>
						</div>
					</aside>
				</div>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------- settings ---- */

const SETTINGS: readonly { group: string; rows: readonly { label: string; value?: string; on?: boolean }[] }[] = [
	{
		group: "Store",
		rows: [
			{ label: "Name", value: "kaffe" },
			{ label: "Address", value: "Hornsgatan 12" },
			{ label: "Currency", value: "SEK" },
		],
	},
	{
		group: "Ordering",
		rows: [
			{ label: "Accept pre-orders", on: true },
			{ label: "Pause new orders", on: false },
			{ label: "Ask for a name", on: true },
		],
	},
	{
		group: "Receipts",
		rows: [
			{ label: "Email receipts", on: true },
			{ label: "Daily summary", on: false },
		],
	},
];

function Settings() {
	return (
		<div className="flex h-full w-full flex-col font-sans text-text">
			<header className="flex h-13 shrink-0 items-center border-border border-b px-6">
				<h1 className="font-semibold text-md tracking-tight">Settings</h1>
			</header>
			<div className="flex flex-col gap-6 px-6 py-5">
				{SETTINGS.map((section) => (
					<section key={section.group} className="flex flex-col gap-3">
						<h2 className="font-medium text-base">{section.group}</h2>
						<ul className="flex flex-col rounded-md border border-border">
							{section.rows.map((row, i) => (
								<li
									key={row.label}
									className={cn(
										"flex h-11 items-center justify-between px-4 text-base leading-base",
										i > 0 && "border-border border-t",
									)}
								>
									<span>{row.label}</span>
									{row.value === undefined ? (
										<span
											className={cn(
												"flex h-4 w-7 items-center rounded-full px-[2px]",
												row.on === true ? "justify-end bg-thread" : "justify-start bg-raised",
											)}
										>
											<span className="h-3 w-3 rounded-full bg-on-thread" />
										</span>
									) : (
										<span className="font-mono text-muted text-sm">{row.value}</span>
									)}
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
			<p className="mt-auto border-border border-t px-6 py-4 text-muted text-sm leading-sm">
				Changes save as you make them.
			</p>
		</div>
	);
}

/* ----------------------------------------------------------------- menu ---- */

const ITEMS = [
	{ name: "Bryggkaffe", note: "Filter, refill included", price: "32 kr" },
	{ name: "Cortado", note: "Double, 90 ml", price: "42 kr" },
	{ name: "Flat white", note: "Double, 160 ml", price: "45 kr" },
	{ name: "Bulle", note: "Baked at six", price: "38 kr" },
	{ name: "Kardemummasnurra", note: "Baked at six", price: "42 kr" },
	{ name: "Havregrynsgröt", note: "With apple and cream", price: "52 kr" },
] as const;

function Menu() {
	return (
		<div className="flex h-full w-full flex-col font-sans text-text">
			<header className="flex h-13 shrink-0 items-center gap-3 border-border border-b px-6">
				<h1 className="font-semibold text-md tracking-tight">Menu</h1>
				<span className="font-mono text-2xs text-muted leading-3">6 items</span>
				<span className="ml-auto flex h-7 items-center rounded-sm border border-border px-3 text-base text-muted">
					Add item
				</span>
			</header>
			<div className="grid grid-cols-3 gap-3 p-5">
				{ITEMS.map((item) => (
					<div key={item.name} className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-4">
						<span className="truncate text-base leading-base">{item.name}</span>
						<span className="truncate text-muted text-sm leading-sm">{item.note}</span>
						<span className="pt-2 font-mono text-sm">{item.price}</span>
					</div>
				))}
			</div>
		</div>
	);
}

/* ---------------------------------------------------------------- login ---- */

function Login() {
	return (
		<div className="flex h-full w-full flex-col justify-center px-10 font-sans text-text">
			<div className="flex items-center gap-2 pb-8">
				<span className="h-[2px] w-2.5 bg-thread" />
				<span className="font-semibold text-md tracking-tight">kaffe</span>
			</div>
			<h1 className="pb-1 font-semibold text-lg tracking-tight">Sign in to the counter</h1>
			<p className="pb-7 text-muted text-base leading-base">Use the address your shift is booked under.</p>
			<div className="flex flex-col gap-4">
				<label className="flex flex-col gap-1.5">
					<span className="text-muted text-sm leading-sm">Email</span>
					<span className="flex h-10 items-center rounded-sm border border-border bg-surface px-3 text-base">
						ida@kaffe.se
					</span>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className="text-muted text-sm leading-sm">Password</span>
					<span className="flex h-10 items-center rounded-sm border border-border bg-surface px-3 font-mono text-md text-muted">
						••••••••••
					</span>
				</label>
			</div>
			<span className="mt-7 flex h-10 items-center justify-center rounded-sm bg-thread font-medium text-base text-on-thread">
				Sign in
			</span>
			<span className="pt-4 text-center text-muted text-sm leading-sm">Forgot your password?</span>
			<p className="pt-10 text-muted text-sm leading-sm">Staff access only. Ask Ida for an account.</p>
		</div>
	);
}

/* ----------------------------------------------------------------- cart ---- */

const LINES = [
	{ item: "Cortado", note: "Oat milk", qty: 1, price: "42 kr" },
	{ item: "Bulle", note: "Warmed", qty: 1, price: "38 kr" },
	{ item: "Bryggkaffe", note: "Large", qty: 2, price: "64 kr" },
] as const;

function Cart() {
	return (
		<div className="flex h-full w-full flex-col font-sans text-text">
			<header className="flex h-14 shrink-0 items-center border-border border-b px-5">
				<h1 className="font-semibold text-md tracking-tight">Your order</h1>
				<span className="ml-auto text-md text-muted">✕</span>
			</header>
			<ul className="flex flex-col px-5">
				{LINES.map((line) => (
					<li key={line.item} className="flex items-center gap-3 border-border border-b py-4">
						<span className="h-11 w-11 shrink-0 rounded-sm bg-surface" />
						<span className="flex min-w-0 flex-1 flex-col">
							<span className="truncate text-base leading-base">{line.item}</span>
							<span className="truncate text-muted text-sm leading-sm">{line.note}</span>
						</span>
						<span className="flex items-center gap-2 font-mono text-sm text-muted">
							<span className="flex h-6 w-6 items-center justify-center rounded-xs border border-border">−</span>
							<span className="text-text">{line.qty}</span>
							<span className="flex h-6 w-6 items-center justify-center rounded-xs border border-border">+</span>
						</span>
						<span className="w-14 shrink-0 text-right font-mono text-sm">{line.price}</span>
					</li>
				))}
			</ul>
			<div className="flex flex-col gap-2.5 px-5 py-5">
				<div className="flex items-center justify-between text-base text-muted leading-base">
					<span>Subtotal</span>
					<span className="font-mono text-sm">144 kr</span>
				</div>
				<div className="flex items-center justify-between text-base text-muted leading-base">
					<span>Staff discount</span>
					<span className="font-mono text-sm">−12 kr</span>
				</div>
				<div className="flex items-center justify-between border-border border-t pt-3 text-base">
					<span>Total</span>
					<span className="font-mono">132 kr</span>
				</div>
			</div>
			<div className="mt-auto flex flex-col gap-2.5 px-5 pb-6">
				<span className="flex h-11 items-center justify-center rounded-sm bg-thread font-medium text-base text-on-thread">
					Pay 132 kr
				</span>
				<span className="text-center text-muted text-sm leading-sm">Pick up at Hornsgatan 12</span>
			</div>
		</div>
	);
}

/* ---------------------------------------------------------------- hours ---- */

const DAYS = [
	{ day: "Monday to Friday", open: "07 – 18" },
	{ day: "Saturday", open: "09 – 17" },
	{ day: "Sunday", open: "09 – 15" },
] as const;

function Hours() {
	return (
		<div className="flex h-full w-full flex-col font-sans text-text">
			<header className="flex h-12 shrink-0 items-center border-border border-b px-5">
				<h1 className="font-semibold text-base tracking-tight">Opening hours</h1>
			</header>
			<ul className="flex flex-col px-5 py-2">
				{DAYS.map((row) => (
					<li key={row.day} className="flex h-11 items-center justify-between text-base leading-base">
						<span>{row.day}</span>
						<span className="font-mono text-sm text-muted">{row.open}</span>
					</li>
				))}
			</ul>
			<p className="mt-auto px-5 pb-5 text-muted text-sm leading-sm">Closed on public holidays.</p>
		</div>
	);
}
