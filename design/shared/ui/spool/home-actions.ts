import { cn } from "shared/lib/utils";

const BASE =
	"inline-flex min-h-[34px] shrink-0 items-center justify-center gap-[9px] rounded-[7px] border px-[13px] py-0 whitespace-nowrap [font:var(--type-control)] disabled:opacity-50 disabled:cursor-wait";

export const HOME_ACTION = cn(BASE, "border-border-raised text-text hover:bg-raised");
export const HOME_ACTION_PRIMARY = cn(BASE, "border-transparent bg-text text-bg");
