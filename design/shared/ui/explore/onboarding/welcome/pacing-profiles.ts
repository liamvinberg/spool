// Separate frames explore the timing of the whole onboarding step.
export type PacingTake = "together" | "exhale" | "pan" | "echo" | "still" | "rise" | "gather" | "travel" | "unfold" | "wander" | "momentum";
// Center, radius, turn, bend, material scale, material travel.
export type PacingPose = readonly [number, number, number, number, number, number, number, number];
interface PacingProfile {
 duration: number;
 transport: number;
 scene?: boolean;
 flowTravel?: number;
 poses: readonly [PacingPose, PacingPose, PacingPose];
 swell: PacingPose;
}
const origin: PacingPose = [.79,.39,.40,.43,0,0,1,0];
const quiet: PacingProfile["poses"] = [origin,[.81,.32,.40,.43,-.04,.02,1,0],[.83,.49,.41,.44,.04,-.02,1,0]];
const turning: PacingProfile["poses"] = [origin,[.80,.27,.46,.36,-.21,.08,1.03,.03],[.85,.56,.39,.52,.16,-.06,1.02,.07]];
const zero: PacingPose = [0,0,0,0,0,0,0,0];
export const pacingProfiles: Record<PacingTake,PacingProfile> = {
 momentum: {duration:900,transport:0,flowTravel:3.6,poses:[origin,origin,origin],swell:zero},
 together: {duration:800,transport:.72,poses:quiet,swell:zero},
 exhale: {duration:1300,transport:.35,poses:[origin,[.82,.35,.46,.48,.04,.04,1.04,0],[.82,.46,.43,.53,-.05,-.04,1.08,.02]],swell:[0,0,.035,.035,0,.025,.035,0]},
 pan: {duration:1100,transport:0,scene:true,poses:[[0,0,0.4,0.43,0,0,1,0],[0.26,0,0.4,0.43,0,0,1,0],[0.52,0,0.4,0.43,0,0,1,0]],swell:zero},
 echo: {duration:1500,transport:.65,poses:turning,swell:zero},
 still: {duration:1200,transport:0,poses:[origin,[.79,.39,.43,.40,-.13,.09,1,.025],[.79,.39,.38,.48,.11,-.07,1,.05]],swell:zero},
 rise: {duration:1600,transport:0,scene:true,poses:[[0,0,0.4,0.43,0,0,1,0],[0,0.34,0.4,0.43,0,0,1,0],[0,0.7,0.4,0.43,0,0,1,0]],swell:zero},
 gather: {duration:1250,transport:.55,poses:quiet,swell:[.015,0,-.065,-.055,0,.06,-.045,0]},
 travel: {duration:1150,transport:0,scene:true,poses:[[0,0,0.4,0.43,0,0,1,0],[0.22,0.2,0.4,0.43,0,0,1,0],[0.43,0.45,0.4,0.43,0,0,1,0]],swell:zero},
 unfold: {duration:1450,transport:.45,poses:[origin,[.85,.31,.31,.54,-.12,.12,1.03,.02],[.78,.50,.51,.35,.14,-.08,1.06,.05]],swell:[.015,0,.015,.01,-.04,.04,0,0]},
 wander: {duration:2000,transport:0,scene:true,poses:[[0,0,0.4,0.43,0,0,1,0],[0.3,0.12,0.4,0.43,0,0,1.05,0],[0.23,0.58,0.4,0.43,0,0,1.1,0]],swell:zero},
};
