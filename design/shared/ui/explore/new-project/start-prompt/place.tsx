import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { Faces } from "shared/ui/explore/cloud/home/parts";
import { ChevronIcon } from "shared/ui/spool/icons";
import { LISTINGS, TIDEMARK } from "./fixture";
import { EASE, ENTER, type Host, Kbd, PlaceGlyph, type Where, whereLabel, wherePath } from "./marks";

/**
 * The place chip: where the open project lives, on the bar beside the canvas
 * readouts. A project started from the prompt is already somewhere, Drafts unless
 * the in control said otherwise, and this is where it gets a better place once it
 * has earned one.
 */
export function PlaceChip({ where, path, open, onToggle }: { where: Where; path: string; open: boolean; onToggle: () => void }) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-expanded={open}
			className={cn("flex h-[28px] items-center gap-[8px] rounded-[7px] border pr-[8px] pl-[8px] type-control", open ? "border-border-raised bg-raised" : "border-border-raised hover:bg-surface")}
		>
			<AnimatePresence mode="popLayout" initial={false}>
				<motion.span
					key={where.kind}
					initial={{ opacity: 0, scale: 0.6 }}
					animate={{ opacity: 1, scale: 1 }}
					exit={{ opacity: 0, scale: 0.6 }}
					transition={{ duration: 0.2, ease: EASE }}
					className="grid place-items-center"
				>
					<PlaceGlyph kind={where.kind} size={14} className="h-[13px] w-[13px]" />
				</motion.span>
			</AnimatePresence>
			<motion.span layout="position" className="flex items-center gap-[8px]">
				<span>{where.kind === "folder" ? where.root.split("/").pop() : whereLabel(where)}</span>
				<span className="relative inline-flex overflow-hidden text-muted type-detail">
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={path}
							initial={{ y: 10, opacity: 0 }}
							animate={{ y: 0, opacity: 1 }}
							exit={{ y: -10, opacity: 0 }}
							transition={{ duration: 0.26, ease: EASE }}
						>
							{path}
						</motion.span>
					</AnimatePresence>
				</span>
			</motion.span>
			<ChevronIcon className="h-[10px] w-[10px] rotate-90 text-muted" />
		</button>
	);
}

type Option = "draft" | "team" | "folder";

export function PlacePopover({
	host,
	name,
	where,
	initialPick,
	onMove,
	onChoose,
	onClose,
}: {
	host: Host;
	name: string;
	where: Where;
	/** the --place frame opens with Tidemark already picked */
	initialPick?: Option | null;
	onMove: (where: Where) => void;
	/** app only: the folder chooser, which hands its pick back through onMove */
	onChoose: () => void;
	onClose: () => void;
}) {
	const options: Option[] = where.kind === "draft" ? ["draft", "team", "folder"] : where.kind === "folder" ? ["folder", "team"] : ["team"];
	const [pick, setPick] = useState<Option | null>(initialPick ?? null);
	const [at, setAt] = useState(Math.max(0, options.indexOf(initialPick ?? where.kind)));
	const [path, setPath] = useState("~/code/");
	const panel = useRef<HTMLDivElement>(null);
	const from = wherePath(where, name);

	useEffect(() => {
		panel.current?.focus({ preventScroll: true });
	}, []);

	const choose = (option: Option) => {
		if (option === where.kind && option !== "folder") {
			setPick(null);
			return;
		}
		if (option === "folder" && host === "app") {
			onChoose();
			return;
		}
		setPick(option);
	};
	const confirm = () => {
		if (pick === "team") onMove({ kind: "team" });
		if (pick === "folder") onMove({ kind: "folder", root: path.replace(/\/+$/, "") });
	};

	return (
		<>
			<button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={onClose} />
			<motion.div
				ref={panel}
				tabIndex={-1}
				initial={{ opacity: 0, y: -6, scale: 0.98 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } }}
				transition={{ duration: 0.2, ease: EASE }}
				onKeyDown={(event) => {
					if (event.target instanceof HTMLInputElement && event.key !== "Enter" && event.key !== "Escape") return;
					if (event.key === "Escape") {
						event.preventDefault();
						if (pick !== null) setPick(null);
						else onClose();
					} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						setAt((index) => (index + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
					} else if (event.key === "Enter") {
						event.preventDefault();
						if (pick !== null) confirm();
						else choose(options[at] ?? "draft");
					}
				}}
				className="absolute top-[50px] right-[16px] z-40 w-[392px] origin-top-right rounded-[10px] border border-border-raised bg-raised outline-none"
			>
				<div className="border-border-raised border-b px-[16px] pt-[14px] pb-[12px]">
					<p className="type-title">Where {name} lives</p>
					<p className="mt-[3px] text-muted type-detail">{from}</p>
				</div>
				<div className="p-[4px]">
					{options.map((option, index) => (
						<Row
							key={option}
							option={option}
							host={host}
							current={option === where.kind && option !== "folder"}
							picked={pick === option}
							cursor={at === index}
							onHover={() => setAt(index)}
							onClick={() => choose(option)}
						/>
					))}
				</div>
				<AnimatePresence initial={false}>
					{pick !== null && (
						<motion.div key={pick} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={ENTER} className="overflow-hidden">
							<div className="border-border-raised border-t px-[16px] pt-[14px] pb-[14px]">
								{pick === "team" ? (
									<p className="type-label text-text">Jonas, Mira and Sam get its files on their Macs, and spool cloud relays every save from here on. design/ has no git history on a team project.</p>
								) : (
									<FolderPath value={path} onChange={setPath} />
								)}
								<p className="mt-[10px] flex flex-wrap items-center gap-x-[6px] text-muted type-detail">
									<span>{from}</span>
									<span>→</span>
									<span className="text-text">{pick === "team" ? wherePath({ kind: "team" }, name) : `${path.replace(/\/+$/, "")}/design`}</span>
								</p>
								<div className="mt-[14px] flex items-center justify-end gap-[8px]">
									<button type="button" onClick={() => setPick(null)} className="h-[30px] rounded-[7px] border border-border-raised px-[12px] type-control hover:bg-surface">
										Keep in {whereLabel(where)}
									</button>
									<button type="button" onClick={confirm} className="flex h-[30px] items-center gap-[8px] rounded-[7px] bg-text px-[12px] text-bg type-control">
										{pick === "team" ? `Move to ${TIDEMARK.name}` : "Move here"}
										<span className="opacity-60 type-detail">⏎</span>
									</button>
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>
		</>
	);
}

function Row({ option, host, current, picked, cursor, onHover, onClick }: { option: Option; host: Host; current: boolean; picked: boolean; cursor: boolean; onHover: () => void; onClick: () => void }) {
	const copy = {
		draft: { title: "Drafts", body: "Only you, on this Mac." },
		team: { title: TIDEMARK.name, body: "Everyone in the team, live." },
		folder: { title: "A folder…", body: host === "app" ? "design/ inside a repo you choose." : "design/ inside a repo, by its path." },
	}[option];
	return (
		<button
			type="button"
			onMouseEnter={onHover}
			onClick={onClick}
			className={cn("flex w-full items-center gap-[12px] rounded-[7px] px-[10px] py-[9px] text-left", (cursor || picked) && "bg-[#ffffff0a]")}
		>
			<span className="grid w-[16px] place-items-center">
				<PlaceGlyph kind={option} size={16} className="h-[14px] w-[14px]" />
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="type-control">{copy.title}</span>
				<span className="text-muted type-label">{copy.body}</span>
			</span>
			{option === "team" && <Faces ids={["jonas", "mira", "sam"]} size={18} ring="border-raised" />}
			{option === "folder" && host === "app" && <Kbd>⌘O</Kbd>}
			{current && <span className="text-muted type-detail">here now</span>}
			{picked && <span className="h-[6px] w-[6px] rounded-full bg-text" />}
		</button>
	);
}

/** the browser's folder picker: a path, with what the daemon lists under it */
function FolderPath({ value, onChange }: { value: string; onChange: (value: string) => void }) {
	const parent = value.replace(/\/[^/]*$/, "") || "~";
	const partial = value.slice(value.lastIndexOf("/") + 1);
	const hits = (LISTINGS[parent] ?? []).filter((name) => name.startsWith(partial));
	return (
		<div>
			<p className="mb-[8px] type-label text-text">A browser has no folder dialog, so type the repo's path. spool lists each folder as you go.</p>
			<input
				autoFocus
				value={value}
				onChange={(event) => onChange(event.target.value)}
				spellCheck={false}
				className="h-[32px] w-full rounded-[7px] border border-muted/50 bg-bg px-[10px] text-text outline-none type-value"
			/>
			<div className="mt-[6px] flex flex-wrap gap-[4px]">
				{hits.map((name) => (
					<button key={name} type="button" onClick={() => onChange(`${parent}/${name}`)} className="rounded-[5px] border border-border-raised px-[7px] py-[2px] text-muted type-detail hover:text-text">
						{name}
					</button>
				))}
			</div>
		</div>
	);
}
