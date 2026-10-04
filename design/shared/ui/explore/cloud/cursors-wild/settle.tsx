import { cn } from "shared/lib/utils";
import { type TakeState, cast, groups, here, seat, tint } from "shared/ui/explore/cloud/cursors-wild/common";
import { Face, FaceRow, WhoList } from "shared/ui/explore/cloud/cursors-wild/faces";
import { Loop } from "shared/ui/explore/cloud/cursors-wild/loop";
import { Scene, TheirSelection } from "shared/ui/explore/cloud/cursors-wild/scene";
import {
	camera,
	FRAME_W,
	type FramePlace,
	frameUnder,
	INES,
	LOOP_MS,
	MAJA,
	MOMENTS,
	type Person,
	pointer,
	ramp,
	receiptHeld,
} from "shared/ui/explore/cloud/cursors-wild/script";

/**
 * Settle: the cursor is your face, and a face that rests goes and sits on the
 * frame's label.
 *
 * One object lives in three places: the face in the top right, the face that
 * carries a hand across the field, and the face sitting in a frame's label row
 * once the hand has rested there for two seconds. Travel and pointing stay
 * live; reading, which is most of the time, leaves the frames clear and the
 * labels saying who is on what, like names on a seating plan.
 */

const SETTLE = 2000;
const FLY = 460;
const FACE = 18;

type Hand = Person & { track: NonNullable<Person["track"]> };

export function SettleTake({ state }: { state: TakeState }) {
	return (
		<Loop duration={LOOP_MS} moments={MOMENTS} start={5900}>
			{(t) => <SettleScene state={state} t={t} />}
		</Loop>
	);
}

const ease = (u: number) => 1 - (1 - u) ** 3;

/** 0 on the hand, 1 in the label; and the frame it is sitting on */
function settled(person: Hand, t: number): { amount: number; frame: FramePlace | null } {
	const at = pointer(person.track, t);
	if (at.pressed) return { amount: 0, frame: null };
	if (at.moving) {
		if (at.before === null || at.before.held < SETTLE + FLY) return { amount: 0, frame: null };
		const frame = frameUnder(t, at.before.x, at.before.y);
		return { amount: frame === null ? 0 : 1 - ease(ramp(at.movedFor, 0, 240)), frame };
	}
	const frame = frameUnder(t, at.x, at.y);
	return { amount: frame === null ? 0 : ease(ramp(at.still, SETTLE, FLY)), frame };
}

function SettleScene({ state, t }: { state: TakeState; t: number }) {
	const people = cast(state);
	const hands = here(people);
	const away = people.filter((person) => person.page !== undefined);
	const held = receiptHeld(t);
	const seats = hands.map((person) => ({ person, ...settled(person, t) }));
	return (
		<Scene
			t={t}
			camera={state === "follow" ? camera(t) : undefined}
			header={
				<FaceRow
					seats={hands.map((person) => seat(person, t))}
					following={state === "follow" ? MAJA.id : undefined}
					open={state === "crowd"}
					end={
						away.length === 0 ? null : (
							<span className="flex items-center gap-1.5 border-border border-l pl-2.5">
								{away.map((person) => (
									<Face key={person.id} seat={seat(person, t)} size={16} className="opacity-60" />
								))}
							</span>
						)
					}
				/>
			}
			labelLit={(place) => seats.some((entry) => entry.frame?.name === place.name && entry.amount > 0.5)}
			onFrame={(place) => (place.name === "receipt" && held ? <TheirSelection color={INES.color} /> : null)}
			panel={state === "crowd" ? <WhoList groups={groups(people, t)} /> : null}
			world={
				<>
					{seats.map((entry) => {
						// sitting order on a label: whoever is listed first takes the right end
						const index = seats.filter(
							(other) => other.frame?.name === entry.frame?.name && other.amount > 0 && seats.indexOf(other) < seats.indexOf(entry),
						).length;
						return <SettleHand key={entry.person.id} person={entry.person} t={t} amount={entry.amount} frame={entry.frame} slot={index} />;
					})}
				</>
			}
			overlay={state === "follow" ? <FollowCorners person={MAJA} /> : null}
		/>
	);
}

function SettleHand({
	person,
	t,
	amount,
	frame,
	slot,
}: {
	person: Hand;
	t: number;
	amount: number;
	frame: FramePlace | null;
	slot: number;
}) {
	const at = pointer(person.track, t);
	const idle = ramp(at.idleFor, 0, 600);
	// on the hand the face hangs below-right of the point; in the label it sits at the row's far end
	const handX = at.x + 4;
	const handY = at.y + 4;
	const seatX = frame === null ? handX : frame.x + FRAME_W - FACE - slot * (FACE + 4);
	const seatY = frame === null ? handY : frame.y - FACE - 5;
	const x = handX + (seatX - handX) * amount;
	const y = handY + (seatY - handY) * amount;
	// resting on bare field there is nowhere to sit, so the face just quietens
	const resting = frame === null && !at.moving && !at.pressed ? ramp(at.still, 3000, 600) : 0;
	const dim = Math.max(idle * 0.65, resting * 0.35);
	return (
		<>
			<span
				className="pointer-events-none absolute rounded-full"
				style={{
					left: at.x - 2.5,
					top: at.y - 2.5,
					width: 5,
					height: 5,
					background: person.color,
					outline: `1.5px solid ${tint("#0e0e0e", 0.55)}`,
					opacity: (1 - amount) * (1 - dim),
				}}
			/>
			<span
				className="pointer-events-none absolute rounded-full"
				style={{
					left: x,
					top: y,
					opacity: 1 - dim,
					outline: `${at.pressed ? 2 : 1.5}px solid ${tint("#0e0e0e", at.pressed ? 0.9 : 0.6)}`,
					transform: `scale(${at.pressed ? 0.9 : 1})`,
					transition: "transform 140ms ease-out",
				}}
			>
				<Face seat={{ id: person.id, name: person.name, color: person.color }} size={FACE} />
			</span>
		</>
	);
}

/** following: their colour takes the four corners of the field, a viewfinder onto their view */
function FollowCorners({ person }: { person: Person }) {
	const arm = 22;
	return (
		<div className="pointer-events-none absolute inset-3 z-10">
			{(["top-0 left-0 border-t-2 border-l-2 rounded-tl-sm", "top-0 right-0 border-t-2 border-r-2 rounded-tr-sm", "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-sm", "bottom-0 right-0 border-b-2 border-r-2 rounded-br-sm"] as const).map(
				(corner) => (
					<span key={corner} className={cn("absolute", corner)} style={{ width: arm, height: arm, borderColor: person.color }} />
				),
			)}
			<span
				className="absolute top-0 left-1/2 -translate-x-1/2 rounded-xs px-2 py-[3px] text-[#0e0e0e] type-detail"
				style={{ background: person.color }}
			>
				following {person.name.toLowerCase()} · esc stops
			</span>
		</div>
	);
}
