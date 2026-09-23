import type { ReactNode } from "react";
import type { Specimen } from "shared/lib/explore/registry/registry-fixture";
import { SlackMessage, SlackWindow } from "shared/ui/demo/slack";

/**
 * What the registry's frames render, drawn small enough to sit on a prototype
 * canvas. Each speaks as its own product. `kaffe` is the Slack channel after an
 * agent has copied it into kaffe and adapted it: the same frame, now the
 * person's to change.
 */

export function SpecimenView({ specimen, kaffe = false }: { specimen: Specimen; kaffe?: boolean }) {
	switch (specimen) {
		case "slack-channel":
			return <SlackChannel kaffe={kaffe} />;
		case "slack-settings":
			return <SlackSettings />;
		case "spool-buttons":
			return <SpoolButtons />;
		case "vercel-buttons":
			return <VercelButtons />;
		case "spool-hero":
			return <SpoolHero />;
		case "grain":
			return <Grain />;
	}
}

/** a frame's content at its own size, scaled down onto the field */
export function Mini({ w, h, scale, children }: { w: number; h: number; scale: number; children: ReactNode }) {
	return (
		<div className="relative overflow-hidden rounded-[6px]" style={{ width: w * scale, height: h * scale }}>
			<div className="absolute top-0 left-0" style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
				{children}
			</div>
		</div>
	);
}

function SlackChannel({ kaffe }: { kaffe: boolean }) {
	return (
		<SlackWindow
			workspace={kaffe ? "Kaffe" : "Acme"}
			channel={kaffe ? "orders" : "releases"}
			topic={kaffe ? "Orders from the app, as they come in" : "What shipped and when"}
			members={kaffe ? 6 : 14}
			rows={
				kaffe
					? [
							{ name: "orders", active: true },
							{ name: "general" },
							{ name: "roastery", unread: 2 },
							{ name: "Sara Lind", kind: "dm", presence: "active" },
						]
					: [
							{ name: "releases", active: true },
							{ name: "design" },
							{ name: "general", unread: 4 },
							{ name: "Maya Chen", kind: "dm", presence: "active" },
						]
			}
		>
			{kaffe ? (
				<>
					<SlackMessage author="Kaffe Orders" initials="K" tint="#8A4B2A" time="08:12">
						<span>New order #214 at Torsgatan 11: 1 × Cortado, 1 × Flat white.</span>
					</SlackMessage>
					<SlackMessage author="Sara Lind" initials="SL" tint="#3D6E8F" time="08:13" reactions={[{ emoji: "☕", count: 1 }]}>
						<span>On it.</span>
					</SlackMessage>
					<SlackMessage author="Kaffe Orders" initials="K" tint="#8A4B2A" time="08:19">
						<span>Order #214 is ready for pickup.</span>
					</SlackMessage>
				</>
			) : (
				<>
					<SlackMessage author="Shipbot" initials="S" tint="#6B4FA0" time="10:42">
						<span>Version 2.4 is ready for review. Checkout, 4 screens.</span>
					</SlackMessage>
					<SlackMessage author="Maya Chen" initials="MC" tint="#3D6E8F" time="10:44" reactions={[{ emoji: "👀", count: 2 }]}>
						<span>Taking a look now.</span>
					</SlackMessage>
				</>
			)}
		</SlackWindow>
	);
}

function SlackSettings() {
	const rows = [
		["Notify me about", "Direct messages, mentions and keywords"],
		["Show a badge on the app icon", "On"],
		["Mute all sounds", "Off"],
		["When I'm not active on desktop", "Send to mobile after 10 minutes"],
	];
	return (
		<div className="flex h-full w-full items-center justify-center font-sans" style={{ background: "#121016", color: "#D1D2D3" }}>
			<div className="w-[720px] rounded-xl border p-8" style={{ background: "#1A1D21", borderColor: "#35373B" }}>
				<div className="mb-6 text-[22px] font-bold">Preferences</div>
				<div className="flex gap-8">
					<div className="flex w-[160px] flex-col gap-1 text-[15px]">
						{["Notifications", "Sidebar", "Themes", "Messages & media", "Accessibility"].map((item, index) => (
							<span key={item} className="rounded-md px-3 py-1.5" style={index === 0 ? { background: "#1164A3", color: "#FFFFFF" } : undefined}>
								{item}
							</span>
						))}
					</div>
					<div className="flex flex-1 flex-col gap-5 text-[15px]">
						{rows.map(([label, value]) => (
							<div key={label} className="flex flex-col gap-1 border-b pb-4" style={{ borderColor: "#35373B" }}>
								<span className="font-bold">{label}</span>
								<span style={{ color: "#ABABAD" }}>{value}</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function SpoolButtons() {
	return (
		<div className="flex h-full w-full flex-col justify-center gap-6 bg-bg p-12 text-text">
			<span className="text-muted type-value">buttons</span>
			<div className="flex items-center gap-3">
				<span className="rounded-md bg-text px-4 py-2 text-bg type-control">Start designing</span>
				<span className="rounded-md border border-border-raised px-4 py-2 type-control">Open…</span>
				<span className="rounded-md px-4 py-2 text-muted type-control">Cancel</span>
			</div>
			<div className="flex items-center gap-3">
				<span className="rounded-xs bg-thread px-2 py-[3px] text-on-thread type-detail">live · esc exits</span>
				<span className="rounded-xs border border-border-raised px-2 py-[3px] text-muted type-detail">390 × 844</span>
			</div>
		</div>
	);
}

function VercelButtons() {
	return (
		<div className="flex h-full w-full flex-col justify-center gap-6 p-12 font-sans" style={{ background: "#000000", color: "#EDEDED" }}>
			<span className="text-[13px]" style={{ color: "#A1A1A1" }}>
				Button
			</span>
			<div className="flex items-center gap-3 text-[14px] font-medium">
				<span className="rounded-md px-3 py-2" style={{ background: "#EDEDED", color: "#0A0A0A" }}>
					Deploy
				</span>
				<span className="rounded-md border px-3 py-2" style={{ borderColor: "#2E2E2E", background: "#0A0A0A" }}>
					Visit
				</span>
				<span className="rounded-md px-3 py-2" style={{ background: "#E5484D", color: "#FFFFFF" }}>
					Delete
				</span>
			</div>
			<div className="flex h-10 w-[320px] items-center rounded-md border px-3 text-[14px]" style={{ borderColor: "#2E2E2E", color: "#A1A1A1" }}>
				my-project.vercel.app
			</div>
		</div>
	);
}

const RIBBON_CSS = `
@keyframes registry-ribbon { 0% { transform: rotate(-18deg) translateX(-6%) } 50% { transform: rotate(-10deg) translateX(6%) } 100% { transform: rotate(-18deg) translateX(-6%) } }
@media (prefers-reduced-motion: reduce) { .registry-ribbon { animation: none !important } }
`;

function SpoolHero() {
	return (
		<div className="relative h-full w-full overflow-hidden" style={{ background: "#0B0B0B" }}>
			<style>{RIBBON_CSS}</style>
			{[0, 1, 2].map((band) => (
				<div
					key={band}
					className="registry-ribbon absolute left-[-20%] h-[120px] w-[140%] rounded-[50%] blur-[18px]"
					style={{
						top: 300 + band * 70,
						background: "linear-gradient(90deg, transparent, #F5391A 30%, #FF8A5C 55%, transparent)",
						opacity: 0.85 - band * 0.22,
						animation: `registry-ribbon ${9 + band * 2}s ease-in-out infinite`,
					}}
				/>
			))}
			<div className="absolute bottom-16 left-16 text-[64px] leading-none tracking-[-2px]" style={{ color: "#F0EFED" }}>
				spool
			</div>
		</div>
	);
}

function Grain() {
	return (
		<div className="relative h-full w-full" style={{ background: "#1E2A24" }}>
			<svg className="absolute inset-0 h-full w-full opacity-60" aria-hidden="true">
				<filter id="registry-grain">
					<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
				</filter>
				<rect width="100%" height="100%" filter="url(#registry-grain)" />
			</svg>
			<div className="absolute inset-0" style={{ background: "radial-gradient(60% 60% at 30% 40%, #5E8C6A88, transparent)" }} />
		</div>
	);
}
