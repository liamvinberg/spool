/**
 * The two frames standing next to `home` on kaffe's `site` page.
 *
 * They exist to be quiet. Every mark this direction draws is a hairline on a
 * frame's own wall, so the comparison it has to survive is a wall with nothing on
 * it — and a wall with nothing on it is only legible next to one that has
 * something. Both are kaffe's own site at the same 0.615 the rest of this canvas
 * uses (390 authored, 240 drawn), in the coffee screens' unchanged palette: paper,
 * one ink, one grey, one surface.
 */

export function KaffeAbout() {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#FEFEFE] font-[Instrument_Sans] text-[#17171A]">
			<Bar />
			<div className="flex min-h-0 flex-1 flex-col px-3 pt-4">
				<h1 className="text-balance font-semibold text-[15px] tracking-tight leading-[18px]">Om kaffe</h1>
				<p className="mt-[7px] text-balance text-[8.5px] text-[#86868B] leading-[13px]">
					Vi rostar i små satser varje tisdag och säljer det vi hinner brygga.
				</p>
				<div className="mt-4 h-[112px] shrink-0 rounded-md bg-[#EFEFF1]" />
				<p className="mt-4 text-balance text-[8.5px] text-[#86868B] leading-[13px]">
					Baren har tolv platser. Bönorna kommer från fyra gårdar och byts när säsongen gör det.
				</p>
				<div className="mt-4 flex flex-col gap-[7px]">
					{[
						{ label: "Rostas", value: "Tisdagar" },
						{ label: "Gårdar", value: "Fyra" },
						{ label: "Platser", value: "Tolv" },
					].map((row) => (
						<div key={row.label} className="flex items-baseline justify-between">
							<span className="text-[8.5px] leading-3">{row.label}</span>
							<span className="text-[8.5px] text-[#86868B] leading-3">{row.value}</span>
						</div>
					))}
				</div>
			</div>
			<Foot />
		</div>
	);
}

export function KaffeContact() {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#FEFEFE] font-[Instrument_Sans] text-[#17171A]">
			<Bar />
			<div className="flex min-h-0 flex-1 flex-col px-3 pt-4">
				<h1 className="text-balance font-semibold text-[15px] tracking-tight leading-[18px]">Hitta hit</h1>
				<div className="mt-3 h-[132px] shrink-0 rounded-md bg-[#EFEFF1]" />
				<div className="mt-4 flex flex-col gap-[7px]">
					{[
						{ label: "Adress", value: "Torsgatan 11" },
						{ label: "Telefon", value: "08 21 44 09" },
						{ label: "Post", value: "hej@kaffe.se" },
					].map((row) => (
						<div key={row.label} className="flex items-baseline justify-between">
							<span className="text-[8.5px] leading-3">{row.label}</span>
							<span className="text-[8.5px] text-[#86868B] leading-3">{row.value}</span>
						</div>
					))}
				</div>
				<p className="mt-4 text-balance text-[8.5px] text-[#86868B] leading-[13px]">
					Tunnelbanan till Sankt Eriksplan, sedan fyra minuter söderut längs Torsgatan.
				</p>
			</div>
			<Foot />
		</div>
	);
}

function Bar() {
	return (
		<div className="flex h-[26px] shrink-0 items-center justify-between border-[#E4E4E7] border-b px-3">
			<span className="font-semibold text-[10px] tracking-tight leading-3">kaffe</span>
			<span className="flex flex-col gap-[3px]">
				<span className="block h-px w-[11px] bg-[#17171A]" />
				<span className="block h-px w-[11px] bg-[#17171A]" />
			</span>
		</div>
	);
}

function Foot() {
	return (
		<div className="flex h-[30px] shrink-0 items-center border-[#E4E4E7] border-t px-3">
			<span className="text-[8px] text-[#86868B] leading-3">Torsgatan 11, Stockholm</span>
		</div>
	);
}
