import { useEffect, useState } from "react";
import { cn } from "shared/lib/utils";
import { MONO, NAME, Section, Sheet } from "shared/ui/spool/system-sheet";

/**
 * The tokens, read off the document rather than written down here.
 *
 * Everything on this page comes out of `getComputedStyle(document.documentElement)`
 * after the first paint, so a value that changed in `shared/tokens.css` changes
 * here and a name that went away shows up as a blank rather than as the number
 * it used to have. The names are the only thing this file holds.
 */

/*
 * The swatch is painted with the utility rather than with `var(--color-…)`,
 * because Tailwind emits a theme property only where something uses it: a token
 * nothing on this page wears would read back empty and the page would be
 * accusing tokens.css of a hole it does not have.
 */
const COLOURS = [
	{ name: "bg", paint: "bg-bg", of: "the window behind everything" },
	{ name: "canvas", paint: "bg-canvas", of: "the field the frames stand on" },
	{ name: "surface", paint: "bg-surface", of: "a row under the pointer, a panel" },
	{ name: "raised", paint: "bg-raised", of: "menus, toasts, the lit glyph" },
	{ name: "border", paint: "bg-border", of: "the hairline between two surfaces" },
	{ name: "border-raised", paint: "bg-border-raised", of: "the edge of something that floats" },
	{ name: "text", paint: "bg-text", of: "everything a person reads" },
	{ name: "muted", paint: "bg-muted", of: "names, counts, anything secondary" },
	{ name: "thread", paint: "bg-thread", of: "the one accent: selection, walks, undo" },
	{ name: "on-thread", paint: "bg-on-thread", of: "ink on the accent" },
] as const;

const RADII = [
	{ name: "radius-xs", round: "rounded-xs", of: "chips, swatches, the entered label" },
	{ name: "radius-sm", round: "rounded-sm", of: "menu rows, small buttons" },
	{ name: "radius-md", round: "rounded-md", of: "menus, toasts, notices" },
	{ name: "radius-lg", round: "rounded-lg", of: "dialogs, the finder panel" },
] as const;

const LAWS = [
	"Chrome is monochrome. Colour appears only where meaning is: the thread, the selection, the active state.",
	"Frames glow and chrome recedes. Nothing in the shell may compete with a prototype.",
	"Names, numbers and readouts are mono, because a frame name is a folder name.",
	"Everything sits on the 4px grid. Hairlines separate surfaces, and shadows never do.",
] as const;

/** every custom property this page draws, read once after the first paint */
function useTokens(names: readonly string[]): Readonly<Record<string, string>> {
	const [read, setRead] = useState<Readonly<Record<string, string>>>({});
	useEffect(() => {
		const style = getComputedStyle(document.documentElement);
		const found: Record<string, string> = {};
		for (const name of names) found[name] = style.getPropertyValue(name).trim();
		setRead(found);
	}, [names]);
	return read;
}

const NAMES = [
	...COLOURS.map((colour) => `--color-${colour.name}`),
	...RADII.map((radius) => `--${radius.name}`),
	"--spacing-unit",
];

export default function Tokens() {
	const read = useTokens(NAMES);
	const unit = read["--spacing-unit"] ?? "";
	return (
		<Sheet
			title="Tokens"
			says="Every value on this page is read off the document at run time, so nothing here can drift from shared/tokens.css. The names are the only thing the frame holds."
		>
			<Section
				name="Colour"
				says="Ten names, and the whole of the palette. A value that is blank is a name shared/tokens.css no longer carries."
			>
				<div className="grid grid-cols-5 gap-x-5 gap-y-7">
					{COLOURS.map((colour) => {
						const value = read[`--color-${colour.name}`] ?? "";
						return (
							<div key={colour.name} className="flex flex-col gap-2.5">
								<div className={cn("h-[72px] w-full rounded-md border border-border", colour.paint)} />
								<div className="flex flex-col gap-1">
									<span className={cn(NAME, colour.name === "thread" && "text-thread")}>
										--color-{colour.name}
									</span>
									<span className={MONO}>{value === "" ? "unset" : value}</span>
									<span className="text-muted/70 text-xs leading-xs">{colour.of}</span>
								</div>
							</div>
						);
					})}
				</div>
			</Section>

			<Section
				name="The spacing unit"
				says="One number, and every gap and pad in the app is a multiple of it. The bars below are drawn from the token itself."
			>
				<div className="flex items-end gap-12">
					<div className="flex flex-col gap-2.5">
						<span className="font-semibold text-lg leading-lg">{unit === "" ? "unset" : unit}</span>
						<span className={NAME}>--spacing-unit</span>
					</div>
					<div className="flex items-end gap-4 pb-1">
						{[1, 2, 3, 4, 6, 8, 12, 16].map((step) => (
							<div key={step} className="flex flex-col items-center gap-2">
								<span
									className="w-6 rounded-xs bg-raised"
									style={{ height: `calc(var(--spacing-unit) * ${step})` }}
								/>
								<span className={MONO}>{step}</span>
							</div>
						))}
					</div>
					<span className="pb-1 text-base text-muted leading-base">
						1, 2, 3, 4, 6, 8, 12 and 16 units. A gap that is not one of these is a gap to argue about.
					</span>
				</div>
			</Section>

			<Section name="Radii" says="Four steps, by how far off the page the thing is meant to read.">
				<div className="flex flex-wrap gap-6">
					{RADII.map((radius) => {
						const value = read[`--${radius.name}`] ?? "";
						return (
							<div key={radius.name} className="flex w-[232px] flex-col gap-2.5">
								<div className={cn("h-[72px] w-full border border-border-raised bg-surface", radius.round)} />
								<div className="flex flex-col gap-1">
									<span className={NAME}>--{radius.name}</span>
									<span className={MONO}>{value === "" ? "unset" : value}</span>
									<span className="text-muted/70 text-xs leading-xs">{radius.of}</span>
								</div>
							</div>
						);
					})}
				</div>
			</Section>

			<Section name="The four laws" says="They decide the arguments the tokens cannot.">
				<ol className="flex max-w-[880px] flex-col">
					{LAWS.map((law, index) => (
						<li key={law} className="flex gap-5 border-border border-b py-4 last:border-b-0">
							<span className={cn("w-4 shrink-0 pt-0.5", MONO)}>{index + 1}</span>
							<span className="text-base leading-base">{law}</span>
						</li>
					))}
				</ol>
			</Section>
		</Sheet>
	);
}
