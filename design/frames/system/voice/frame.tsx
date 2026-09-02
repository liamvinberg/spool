import { cn } from "shared/lib/utils";
import { CollisionNotice, NoticeStrip } from "shared/ui/spool/collision-notice";
import { MenuItem, MenuRule } from "shared/ui/spool/context-menu";
import { FrameLabel } from "shared/ui/spool/frame-label";
import { HandNotice } from "shared/ui/spool/hand-notice";
import { Across, MONO, NAME, Section, Sheet, Spec } from "shared/ui/spool/system-sheet";
import { Toast } from "shared/ui/spool/toast";
import { TrashToast } from "shared/ui/spool/trash-toast";

/**
 * How spool talks, on the chrome it talks through.
 *
 * The rules are `design/AGENTS.md`'s Voice section, tightened, and every one of
 * them is shown rather than stated twice: the two registers stand side by side
 * on real components, and each banned construction is drawn once next to the
 * sentence that replaces it.
 */

export default function Voice() {
	return (
		<Sheet
			title="How spool talks"
			says="One rule with two registers, wherever words face a person: frames, chrome, the site, the docs. Every specimen below is the shipped component, not a drawing of it."
		>
			<Section
				name="One rule, two registers"
				says="If the machine would print it, it is verbatim lowercase mono: commands, paths, frame names, chips, counts, status lines. If a person is saying it, it is a sentence, with proper nouns restored and a period when it is a whole one."
			>
				<div className="grid grid-cols-2 gap-x-10">
					<Register
						kind="the machine printing"
						face="lowercase mono, verbatim"
						items={[
							{
								name: "frame label, entered and at rest",
								field: 116,
								node: (
									<div className="absolute top-9 left-6 h-px w-[240px]">
										<FrameLabel
											name="cart"
											frameWidth={240}
											k={1}
											entered
											paused={false}
											selected={false}
											hovered={false}
										/>
										<div className="absolute top-12 left-0 w-[240px]">
											<FrameLabel
												name="receipt"
												frameWidth={240}
												k={1}
												entered={false}
												paused
												selected={false}
												hovered={false}
												unseen="new"
											/>
										</div>
									</div>
								),
							},
							{
								name: "pages rail, a page and its count",
								node: (
									<div className="flex w-[200px] items-center justify-between">
										<span className="font-mono text-sm text-text leading-sm">app</span>
										<span className="font-mono text-2xs text-muted/60 leading-3">14</span>
									</div>
								),
							},
							{
								name: "the empty field",
								node: <span className="font-mono text-sm text-muted leading-sm">no frames yet</span>,
							},
							{
								name: "collision notice, in the canvas strip",
								field: 84,
								node: (
									<NoticeStrip>
										<CollisionNotice
											collisions={[{ name: "cart", paths: ["frames/app/cart", "frames/site/cart"] }]}
										/>
									</NoticeStrip>
								),
							},
						]}
					/>
					<Register
						kind="a person speaking"
						face="sentence case, proper nouns restored"
						items={[
							{
								name: "the Trash toast, where the canvas puts it",
								field: 168,
								node: <TrashToast frames={["cart"]} />,
							},
							{
								name: "the canvas toast",
								field: 168,
								node: <Toast notice={{ kind: "success", message: "Copied the path to cart" }} />,
							},
							{
								name: "a menu row",
								node: (
									<div className="w-[200px] rounded-md border border-border-raised bg-raised p-unit">
										<MenuItem label="Play from here" keys="P" />
										<MenuRule />
										<MenuItem label="Move to Trash" keys="⌫" />
									</div>
								),
							},
							{
								name: "the hand notice, both voices in one line",
								node: (
									<div className="relative w-full">
										<HandNotice said={{ kind: "clamped", frame: "cart" }} />
									</div>
								),
							},
						]}
					/>
				</div>
			</Section>

			<Section
				name="The name is spool everywhere"
				says="Wordmark, command and prose share the one form, sentence start included. There is no capital S waiting for the beginning of a line."
			>
				<Across>
					<Spec name="wordmark" width={232}>
						<span className="font-semibold text-md tracking-tight leading-sm">spool</span>
					</Spec>
					<Spec name="command" width={232}>
						<span className="font-mono text-sm text-text leading-4">spool open ~/kaffe</span>
					</Spec>
					<Spec name="prose" width={420}>
						<span className="text-base leading-base">spool renders the frame you wrote, live.</span>
					</Spec>
				</Across>
			</Section>

			<Section
				name="Say what the thing is, then stop"
				says="One evocative line is allowed per page and the sentence after it has to be literal. No hype adjectives and no exclamation marks."
				tight
			>
				<Pair
					wrong="A breathtakingly fast, delightfully simple canvas for the AI era!"
					right="Frames are TSX files on disk. spool renders them and puts them on a canvas."
					wrongSays="hype, and an exclamation mark"
					rightSays="the thing, then the mechanism"
				/>
			</Section>

			<Section
				name="Two constructions are banned"
				says="They are the two a language model reaches for first. State what is true and let the reader draw the contrast."
				tight
			>
				<Pair
					label="the correction"
					wrong="The bars are not drawn. They are a number over the largest number."
					right="Each bar is one number over the largest number in the set."
					wrongSays="says the wrong thing first"
					rightSays="says the true thing once"
				/>
				<Pair
					label="the stacked negation"
					wrong="No server, no seed script, no build step."
					right="It runs from the folder you point it at."
					wrongSays="three absences in a row"
					rightSays="one presence"
				/>
			</Section>

			<Section
				name="Vary sentence length inside a block"
				says="Four leads built to the same two-fragment shape read as generated even when every one of them is accurate."
				tight
			>
				<Pair
					wrong="Frames on disk, rendered live. Flows read from source, drawn as arrows. Scenarios as seeds, named in a file."
					right="Frames are files on disk. spool reads the walks out of the source and draws them as arrows between the frames they join. Scenarios are named seeds."
					wrongSays="one shape, three times"
					rightSays="short, long, short"
				/>
			</Section>

			<Section
				name="Reach for a filename, a number or a key"
				says="A concrete noun beats an abstraction, and the terminal is allowed to speak for itself when it is the subject."
				tight
			>
				<Pair
					wrong="Spatial configuration is persisted per frame."
					right="frame.json is where a frame sits on the canvas."
					wrongSays="an abstraction"
					rightSays="a filename"
				/>
				<Pair
					wrong="Run the open command in your repository."
					right={
						<span className="font-mono text-sm text-text leading-4">
							<span className="text-muted">~/kaffe $</span> spool open
						</span>
					}
					wrongSays="a sentence about a terminal"
					rightSays="the prompt naming the directory"
				/>
			</Section>

			<Section
				name="A demo product speaks as itself"
				says="A fake product on a frame wears its own name and its own sentence case. It never puts on spool's costume."
				tight
			>
				<Pair
					wrong="kaffe · order placed"
					right="Thanks! Order #214 is on its way."
					wrongSays="spool's mono, on somebody else's product"
					rightSays="kaffe, in kaffe's voice"
				/>
			</Section>
		</Sheet>
	);
}

function Register({
	kind,
	face,
	items,
}: {
	kind: string;
	face: string;
	items: readonly { name: string; node: React.ReactNode; field?: number }[];
}) {
	return (
		<div className="flex h-fit flex-col gap-5 self-start border-border border-l pl-6">
			<div className="flex flex-col gap-1">
				<span className="text-base text-text leading-base">{kind}</span>
				<span className={MONO}>{face}</span>
			</div>
			{items.map((item) => (
				<div key={item.name} className="flex flex-col gap-2.5">
					{/* a toast is placed against the field it stands on, so the specimen
					    is a field rather than a box wrapped round the pill */}
					<div
						className={cn(
							"relative rounded-md border border-border bg-canvas",
							item.field === undefined ? "flex min-h-[44px] items-center px-4 py-3" : "overflow-hidden",
						)}
						style={item.field === undefined ? undefined : { height: item.field }}
					>
						{item.node}
					</div>
					<span className={cn("min-w-0", MONO)}>{item.name}</span>
				</div>
			))}
		</div>
	);
}

/** A banned line and the line that replaces it, in that order and once each. */
function Pair({
	label,
	wrong,
	right,
	wrongSays,
	rightSays,
}: {
	label?: string;
	wrong: React.ReactNode;
	right: React.ReactNode;
	wrongSays: string;
	rightSays: string;
}) {
	return (
		<div className="flex flex-col gap-2.5">
			{label === undefined ? null : <span className={NAME}>{label}</span>}
			<div className="grid grid-cols-2 gap-x-10 rounded-md border border-border">
				<Line tone="wrong" says={wrongSays}>
					{wrong}
				</Line>
				<Line tone="right" says={rightSays}>
					{right}
				</Line>
			</div>
		</div>
	);
}

function Line({
	tone,
	says,
	children,
}: {
	tone: "wrong" | "right";
	says: string;
	children: React.ReactNode;
}) {
	return (
		<div className={cn("flex flex-col gap-3 px-5 py-4", tone === "right" && "border-border border-l")}>
			<span className={cn("max-w-[520px] text-base leading-base", tone === "wrong" ? "text-muted/55" : "text-text")}>
				{children}
			</span>
			<span className="flex items-center gap-2">
				<span
					className={cn(
						"h-1.5 w-1.5 shrink-0 rounded-full",
						tone === "wrong" ? "bg-thread" : "bg-muted/50",
					)}
				/>
				<span className={MONO}>{says}</span>
			</span>
		</div>
	);
}

// watcher poke
