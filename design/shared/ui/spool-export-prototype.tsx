import { useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "./coffee-screens";
import { SpoolShell } from "./spool-shell";

type ExportConcept = "direct" | "submenu" | "adaptive";
type ExportFormat = "png" | "pdf";
type SelectionCount = 1 | 3;

interface SpoolExportPrototypeProps {
	concept: ExportConcept;
}

const frames = [
	{ name: "menu", left: 160, top: 138 },
	{ name: "cart", left: 600, top: 174 },
	{ name: "receipt", left: 1040, top: 122 },
] as const satisfies readonly {
	name: CoffeeScreenName;
	left: number;
	top: number;
}[];

export function SpoolExportPrototype({ concept }: SpoolExportPrototypeProps) {
	const [selectionCount, setSelectionCount] = useState<SelectionCount>(concept === "direct" ? 1 : 3);
	const [menuOpen, setMenuOpen] = useState(concept !== "adaptive");
	const [submenuOpen, setSubmenuOpen] = useState(concept === "submenu");
	const [dialogOpen, setDialogOpen] = useState(concept === "adaptive");
	const [format, setFormat] = useState<ExportFormat>("png");
	const [toast, setToast] = useState<string | null>(null);

	const select = (count: SelectionCount) => {
		setSelectionCount(count);
		setMenuOpen(true);
		setSubmenuOpen(concept === "submenu");
		setDialogOpen(false);
		setToast(null);
		setFormat("png");
	};

	const openMenu = () => {
		setMenuOpen(true);
		setSubmenuOpen(concept === "submenu");
		setDialogOpen(false);
		setToast(null);
	};

	const finishExport = (nextFormat: ExportFormat) => {
		const message =
			nextFormat === "pdf"
				? `Exported ${selectionCount === 1 ? "cart.pdf" : "kaffe-flow.pdf"}`
				: `Exported ${selectionCount === 1 ? "cart.png" : "3 PNG images"}`;
		setToast(message);
		setMenuOpen(false);
		setSubmenuOpen(false);
		setDialogOpen(false);
	};

	return (
		<SpoolShell activeTab="kaffe" mode="live" zoom="72%">
			<div
				className="relative h-full overflow-hidden bg-canvas"
				onContextMenu={(event) => {
					event.preventDefault();
					openMenu();
				}}
			>
				<ThreadSvg />
				{frames.map((frame, index) => (
					<PrototypeFrame
						key={frame.name}
						{...frame}
						selected={selectionCount === 3 || (selectionCount === 1 && frame.name === "cart")}
						selectionIndex={selectionCount === 3 ? index + 1 : undefined}
					/>
				))}

				{menuOpen ? (
					<ExportContextMenu
						concept={concept}
						selectionCount={selectionCount}
						submenuOpen={submenuOpen}
						onSubmenuOpen={() => setSubmenuOpen(true)}
						onExport={(nextFormat) => {
							if (concept === "adaptive" && selectionCount === 3) {
								setFormat(nextFormat);
								setMenuOpen(false);
								setDialogOpen(true);
								return;
							}
							finishExport(nextFormat);
						}}
					/>
				) : null}

				{dialogOpen ? (
					<ExportDialog
						format={format}
						selectionCount={selectionCount}
						onCancel={openMenu}
						onFormatChange={setFormat}
						onExport={() => finishExport(format)}
					/>
				) : null}

				{toast !== null ? <ExportToast message={toast} /> : null}

				<PrototypeControls
					selectionCount={selectionCount}
					onOpenMenu={openMenu}
					onSelect={select}
				/>
			</div>
		</SpoolShell>
	);
}

function PrototypeFrame({
	left,
	name,
	selected,
	selectionIndex,
	top,
}: {
	left: number;
	name: CoffeeScreenName;
	selected: boolean;
	selectionIndex?: number;
	top: number;
}) {
	return (
		<div className="absolute flex flex-col gap-1.5" style={{ left, top }}>
			<div className="flex h-4 items-center gap-1.5 font-mono text-sm leading-xs">
				<span className="text-2xs text-muted">▸</span>
				<span className={selected ? "text-thread" : "text-muted"}>{name}</span>
			</div>
			<div className="relative h-[520px] w-[240px]">
				<CoffeeScreen screen={name} />
				{selected ? <FrameSelection index={selectionIndex} /> : null}
			</div>
		</div>
	);
}

function FrameSelection({ index }: { index?: number }) {
	return (
		<>
			<div className="pointer-events-none absolute -inset-[3px] rounded-[14px] border-[1.5px] border-thread" />
			{[
				"-left-[7px] -top-[7px]",
				"-right-[7px] -top-[7px]",
				"-bottom-[7px] -left-[7px]",
				"-bottom-[7px] -right-[7px]",
			].map((position) => (
				<span
					key={position}
					className={cn("absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread", position)}
				/>
			))}
			{index === undefined ? null : (
				<div className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-thread px-1 font-mono text-2xs text-on-thread leading-none">
					{index}
				</div>
			)}
		</>
	);
}

function ExportContextMenu({
	concept,
	onExport,
	onSubmenuOpen,
	selectionCount,
	submenuOpen,
}: {
	concept: ExportConcept;
	onExport: (format: ExportFormat) => void;
	onSubmenuOpen: () => void;
	selectionCount: SelectionCount;
	submenuOpen: boolean;
}) {
	const left = concept === "submenu" ? 704 : 824;
	return (
		<>
			<div
				role="menu"
				className="absolute z-20 flex w-[220px] flex-col rounded-md border border-border-raised bg-raised p-unit"
				style={{ left, top: 278 }}
				onContextMenu={(event) => event.preventDefault()}
			>
				<MenuItem>Play from here</MenuItem>
				<MenuItem>Open in editor</MenuItem>
				<MenuDivider />
				{concept === "direct" ? (
					selectionCount === 1 ? (
						<MenuItem active onClick={() => onExport("png")}>
							Export as PNG
						</MenuItem>
					) : (
						<>
							<MenuItem active onClick={() => onExport("png")}>
								Export 3 PNG images
							</MenuItem>
							<MenuItem onClick={() => onExport("pdf")}>Export as PDF</MenuItem>
						</>
					)
				) : null}
				{concept === "submenu" ? (
					<MenuItem
						active={submenuOpen}
						trailing={<ChevronRightIcon className="h-3.5 w-3.5" />}
						onClick={onSubmenuOpen}
						onPointerEnter={onSubmenuOpen}
					>
						Export
					</MenuItem>
				) : null}
				{concept === "adaptive" ? (
					<MenuItem
						active
						onClick={() => onExport("png")}
					>
						{selectionCount === 1 ? "Export as PNG" : "Export 3 frames…"}
					</MenuItem>
				) : null}
				<MenuDivider />
				<MenuItem>Move to Trash</MenuItem>
			</div>

			{concept === "submenu" && submenuOpen ? (
				<div
					role="menu"
					className="absolute left-[928px] top-[338px] z-20 flex w-[220px] flex-col rounded-md border border-border-raised bg-raised p-unit"
					onContextMenu={(event) => event.preventDefault()}
				>
					<FormatMenuItem
						active
						description={selectionCount === 1 ? "One image file" : "3 separate files"}
						label={selectionCount === 1 ? "PNG image" : "PNG images"}
						onClick={() => onExport("png")}
					/>
					<FormatMenuItem
						description={selectionCount === 1 ? "One page" : "3 pages, left to right"}
						label="PDF document"
						onClick={() => onExport("pdf")}
					/>
				</div>
			) : null}
		</>
	);
}

function MenuItem({
	active = false,
	children,
	onClick,
	onPointerEnter,
	trailing,
}: {
	active?: boolean;
	children: ReactNode;
	onClick?: () => void;
	onPointerEnter?: () => void;
	trailing?: ReactNode;
}) {
	return (
		<button
			type="button"
			role="menuitem"
			className={cn(
				"flex h-[30px] shrink-0 items-center justify-between rounded-sm px-3 text-left text-base text-text leading-[14px]",
				active && "bg-surface",
			)}
			onClick={onClick}
			onPointerEnter={onPointerEnter}
		>
			<span>{children}</span>
			{trailing}
		</button>
	);
}

function FormatMenuItem({
	active = false,
	description,
	label,
	onClick,
}: {
	active?: boolean;
	description: string;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			role="menuitem"
			className={cn("flex min-h-[46px] flex-col justify-center rounded-sm px-3 text-left", active && "bg-surface")}
			onClick={onClick}
		>
			<span className="text-base text-text leading-[16px]">{label}</span>
			<span className="text-muted text-xs leading-[15px]">{description}</span>
		</button>
	);
}

function MenuDivider() {
	return <div className="mx-auto h-px w-[196px] shrink-0 bg-border-raised" />;
}

function ExportDialog({
	format,
	onCancel,
	onExport,
	onFormatChange,
	selectionCount,
}: {
	format: ExportFormat;
	onCancel: () => void;
	onExport: () => void;
	onFormatChange: (format: ExportFormat) => void;
	selectionCount: SelectionCount;
}) {
	return (
		<div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/55">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="export-dialog-title"
				className="w-[380px] rounded-lg border border-border-raised bg-raised"
			>
				<div className="flex items-center justify-between border-border-raised border-b px-5 py-4">
					<h2 id="export-dialog-title" className="font-medium text-md leading-md">
						Export {selectionCount === 1 ? "cart" : "3 frames"}
					</h2>
					<span className="font-mono text-muted text-xs leading-xs">{selectionCount} selected</span>
				</div>

				<div className="flex gap-2 border-border-raised border-b px-5 py-4">
					{frames.slice(0, selectionCount).map((frame, index) => (
						<div
							key={frame.name}
							className="relative h-[70px] w-[40px] overflow-hidden rounded-xs border border-border-raised bg-[#FEFEFE]"
						>
							<div className="absolute inset-x-1 top-1.5 h-1 rounded-full bg-[#D9D9DE]" />
							<div className="absolute inset-x-1 top-4 h-1 rounded-full bg-[#EFEFF1]" />
							<div className="absolute inset-x-1 top-[22px] h-1 rounded-full bg-[#EFEFF1]" />
							<div className="absolute inset-x-1 bottom-1.5 h-1.5 rounded-full bg-[#17171A]" />
							{selectionCount === 3 ? (
								<span className="absolute right-0.5 top-0.5 font-mono text-[7px] text-[#86868B] leading-none">
									{index + 1}
								</span>
							) : null}
						</div>
					))}
					<div className="ml-2 flex min-w-0 flex-1 flex-col justify-center">
						<span className="text-base leading-base">
							{selectionCount === 1 ? "cart" : "menu, cart, receipt"}
						</span>
						<span className="text-muted text-xs leading-xs">
							{selectionCount === 1 ? "Frame content only" : "Canvas order, left to right"}
						</span>
					</div>
				</div>

				<div className="flex flex-col gap-1 px-3 py-3" role="radiogroup" aria-label="Export format">
					<FormatOption
						checked={format === "png"}
						description={selectionCount === 1 ? "One image file" : "3 separate image files"}
						label={selectionCount === 1 ? "PNG image" : "PNG images"}
						onClick={() => onFormatChange("png")}
					/>
					<FormatOption
						checked={format === "pdf"}
						description={selectionCount === 1 ? "One-page document" : "One document with 3 pages"}
						label="PDF document"
						onClick={() => onFormatChange("pdf")}
					/>
				</div>

				<div className="flex items-center justify-end gap-2 border-border-raised border-t px-4 py-3">
					<button
						type="button"
						className="flex h-8 items-center rounded-sm px-3 text-base text-muted leading-none"
						onClick={onCancel}
					>
						Cancel
					</button>
					<button
						type="button"
						className="flex h-8 items-center rounded-sm bg-thread px-4 font-medium text-base text-on-thread leading-none"
						onClick={onExport}
					>
						Export
					</button>
				</div>
			</div>
		</div>
	);
}

function FormatOption({
	checked,
	description,
	label,
	onClick,
}: {
	checked: boolean;
	description: string;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={checked}
			className={cn(
				"flex items-center gap-3 rounded-md border px-3 py-2.5 text-left",
				checked ? "border-thread bg-surface" : "border-transparent",
			)}
			onClick={onClick}
		>
			<span
				className={cn(
					"flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
					checked ? "border-thread" : "border-muted",
				)}
			>
				{checked ? <span className="h-2 w-2 rounded-full bg-thread" /> : null}
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="text-base leading-[16px]">{label}</span>
				<span className="text-muted text-xs leading-[15px]">{description}</span>
			</span>
		</button>
	);
}

function ExportToast({ message }: { message: string }) {
	return (
		<div className="absolute bottom-[74px] left-1/2 z-30 -translate-x-1/2 rounded-md border border-border-raised bg-raised px-3.5 py-2.5 text-base leading-base">
			{message}
		</div>
	);
}

function PrototypeControls({
	onOpenMenu,
	onSelect,
	selectionCount,
}: {
	onOpenMenu: () => void;
	onSelect: (count: SelectionCount) => void;
	selectionCount: SelectionCount;
}) {
	return (
		<div
			aria-label="Prototype controls"
			className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-md border border-border-raised bg-raised p-unit"
		>
			<span className="px-2 font-mono text-muted text-xs leading-xs">Selection</span>
			{([1, 3] as const).map((count) => (
				<button
					key={count}
					type="button"
					className={cn(
						"flex h-7 items-center rounded-sm px-3 text-base leading-none",
						selectionCount === count ? "bg-surface text-text" : "text-muted",
					)}
					onClick={() => onSelect(count)}
				>
					{count === 1 ? "1 frame" : "3 frames"}
				</button>
			))}
			<div className="mx-1 h-4 w-px bg-border-raised" />
			<button
				type="button"
				className="flex h-7 items-center rounded-sm px-3 text-base text-text leading-none"
				onClick={onOpenMenu}
			>
				Open menu
			</button>
		</div>
	);
}

function ChevronRightIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} aria-hidden="true">
			<path
				d="m6 3.5 4.5 4.5L6 12.5"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
			/>
		</svg>
	);
}

function ThreadSvg() {
	return (
		<svg
			className="pointer-events-none absolute inset-0 h-full w-full"
			viewBox="0 0 1440 856"
			fill="none"
			aria-hidden="true"
		>
			<path d="M404 424C472 420 520 466 588 462" stroke="var(--color-thread)" strokeWidth="1.5" />
			<path d="m598 462-10-5v10Z" fill="var(--color-thread)" />
			<path d="M844 462C916 458 956 408 1028 408" stroke="var(--color-thread)" strokeWidth="1.5" />
			<path d="m1038 408-10-5v10Z" fill="var(--color-thread)" />
		</svg>
	);
}
