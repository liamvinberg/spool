type ClassValue = string | false | null | undefined;

export function cn(...values: readonly ClassValue[]): string {
	return values.filter((value): value is string => typeof value === "string" && value !== "").join(" ");
}
