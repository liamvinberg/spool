import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";

/**
 * Who is looking, as the top right of the window draws it: a face per person,
 * a press on one follows them, and the count opens the list. A face is the
 * person's colour with their initial, because that colour is the only thing
 * that ties the face up here to the hand down on the canvas.
 */

export interface Seat {
	id: string;
	name: string;
	color: string;
	idle?: boolean | undefined;
	/** something about this person is happening now: drawn as a ring */
	ringed?: boolean | undefined;
}

export function Face({ seat, size = 22, className }: { seat: Seat; size?: number; className?: string | undefined }) {
	return (
		<span
			className={cn(
				"relative flex shrink-0 items-center justify-center rounded-full font-medium text-[#0e0e0e] transition-opacity duration-300",
				seat.idle === true && "opacity-35",
				className,
			)}
			style={{ width: size, height: size, background: seat.color, fontSize: Math.round(size * 0.48) }}
		>
			{seat.name.slice(0, 1)}
		</span>
	);
}

/** overlapping faces, then the count; `open` stands the list under them */
export function FaceRow({
	seats,
	following,
	count,
	open = false,
	end,
}: {
	seats: readonly Seat[];
	following?: string | undefined;
	/** shown after the faces when there are more people than faces */
	count?: number | undefined;
	/** the list behind the faces is open; the scene draws it, under the bar */
	open?: boolean | undefined;
	/** something the take adds after the faces */
	end?: ReactNode;
}) {
	return (
		<div className="flex h-full items-center gap-2.5 border-border border-l pl-4">
			<div className="flex items-center">
				{seats.map((seat, index) => (
					<span
						key={seat.id}
						className={cn(
							"relative rounded-full border-2 border-bg outline-offset-0 transition-[outline-color] duration-300",
							index > 0 && "-ml-1.5",
						)}
						style={{
							zIndex: seats.length - index,
							outline: "1.5px solid",
							outlineColor: following === seat.id || seat.ringed === true ? seat.color : "transparent",
						}}
					>
						<Face seat={seat} />
					</span>
				))}
			</div>
			{count === undefined ? null : (
				<span className={cn("type-detail", open ? "text-text" : "text-muted")}>{count}</span>
			)}
			{end}
		</div>
	);
}

export interface WhoRow {
	seat: Seat;
	where: string;
}

/** the list behind the faces: who is here, grouped by the page they are on */
export function WhoList({ groups }: { groups: readonly { page: string; here?: boolean; rows: readonly WhoRow[] }[] }) {
	return (
		<div className="w-[260px] animate-menu-in rounded-md border border-border-raised bg-bg py-1.5">
			{groups.map((group, index) => (
				<div key={group.page} className={cn(index > 0 && "mt-1.5 border-border border-t pt-1.5")}>
					<div className="flex h-7 items-center justify-between px-3">
						<span className={cn("type-detail", group.here === true ? "text-text" : "text-muted")}>{group.page}</span>
						{group.here === true ? <span className="text-muted type-detail">this page</span> : null}
					</div>
					{group.rows.map((row) => (
						<div key={row.seat.id} className="flex h-8 items-center gap-2.5 px-3 hover:bg-surface">
							<Face seat={row.seat} size={20} />
							<span className={cn("min-w-0 flex-1 truncate type-label", row.seat.idle === true ? "text-muted" : "text-text")}>
								{row.seat.name}
							</span>
							<span className="shrink-0 text-muted type-detail">{row.where}</span>
						</div>
					))}
				</div>
			))}
		</div>
	);
}
