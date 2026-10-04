/** spool's entering curve; nothing that enters here runs past 300ms */
export const EASE = [0.22, 0.61, 0.36, 1] as const;
/** a stage growing into a canvas, or a canvas shrinking back into its cover */
export const GROW = { duration: 0.28, ease: EASE };
export const QUICK = { duration: 0.14, ease: EASE };
