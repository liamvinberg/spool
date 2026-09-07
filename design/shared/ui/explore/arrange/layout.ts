import type { CoffeeScreenName } from "shared/ui/demo/coffee-screens";

// Throwaway geometry for three ways to arrange a selection. No document writes.
export type Layout = "free" | "row" | "column" | "grid";
export type Alignment = "start" | "center" | "end";
export interface Tile {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
	screen: CoffeeScreenName;
}
export interface Settings {
	layout: Layout;
	columns: number;
	gap: number;
	align: Alignment;
}
export interface Box { x: number; y: number; w: number; h: number }
export interface Camera { x: number; y: number; zoom: number }

export const INITIAL: Settings = { layout: "free", columns: 5, gap: 80, align: "start" };
const NAMES = ["menu", "menu--quiet", "menu--list", "cart", "cart--empty", "checkout", "checkout--address", "receipt", "receipt--print", "account"];
const JITTER = [32, -45, 67, -18, 45, -35, 60, -12, 40, -25];

export function fixture(mixed: boolean): Tile[] {
	return NAMES.map((id, index) => ({
		id,
		x: (index % 5) * 470 + (JITTER[9 - index] ?? 0),
		y: Math.floor(index / 5) * 540 + (JITTER[index] ?? 0),
		w: mixed && index % 3 === 0 ? 440 : 320,
		h: mixed && index % 3 === 1 ? 300 : 390,
		screen: index < 3 ? "menu" : index < 7 ? "cart" : "receipt",
	}));
}

export function bounds(tiles: readonly Box[]): Box {
	if (!tiles.length) return { x: 0, y: 0, w: 1, h: 1 };
	const x = Math.min(...tiles.map((tile) => tile.x));
	const y = Math.min(...tiles.map((tile) => tile.y));
	return { x, y, w: Math.max(...tiles.map((tile) => tile.x + tile.w)) - x, h: Math.max(...tiles.map((tile) => tile.y + tile.h)) - y };
}

export function fit(tiles: readonly Tile[], width: number, height: number): Camera {
	const box = bounds(tiles);
	const zoom = Math.min(0.72, (width - 150) / box.w, (height - 300) / box.h);
	return { x: (width - box.w * zoom) / 2 - box.x * zoom, y: 135 + (height - 300 - box.h * zoom) / 2 - box.y * zoom, zoom };
}

export function arranged(tiles: readonly Tile[], selected: readonly string[], settings: Settings): Tile[] {
	const held = tiles.filter((tile) => selected.includes(tile.id));
	if (settings.layout === "free" || held.length < 2) return [...tiles];
	const box = bounds(held);
	const columns = settings.layout === "row" ? held.length : settings.layout === "column" ? 1 : Math.min(settings.columns, held.length);
	const rows = Math.ceil(held.length / columns);
	const widths = Array.from({ length: columns }, (_, col) => Math.max(...held.filter((_, i) => i % columns === col).map((tile) => tile.w)));
	const heights = Array.from({ length: rows }, (_, row) => Math.max(...held.slice(row * columns, (row + 1) * columns).map((tile) => tile.h)));
	const positions = new Map(held.map((tile, index) => {
		const col = index % columns;
		const row = Math.floor(index / columns);
		const align = settings.align === "start" ? 0 : settings.align === "center" ? 0.5 : 1;
		return [tile.id, {
			...tile,
			x: box.x + widths.slice(0, col).reduce((a, b) => a + b, 0) + col * settings.gap + ((widths[col] ?? tile.w) - tile.w) * align,
			y: box.y + heights.slice(0, row).reduce((a, b) => a + b, 0) + row * (settings.gap + 36) + ((heights[row] ?? tile.h) - tile.h) * align,
		}];
	}));
	return tiles.map((tile) => positions.get(tile.id) ?? tile);
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
