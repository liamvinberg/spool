export type FlowEasing = "linear" | "accelerate" | "cruise" | "late-brake" | "sine";

// The value moves through the same amount of pigment; slope gives its speed.
export function sampleFlowEasing(kind: FlowEasing, p: number): { value: number; slope: number } {
 switch (kind) {
  case "linear": return { value:p, slope:1 };
  case "accelerate": return { value:p*p, slope:2*p };
  case "sine": return { value:(1-Math.cos(Math.PI*p))/2, slope:Math.PI*Math.sin(Math.PI*p)/2 };
  case "cruise": return cruise(p,.12,.08);
  case "late-brake": return cruise(p,0,.14);
 }
}

function cruise(p: number, rise: number, fall: number): { value: number; slope: number } {
 const speed=1/(1-(rise+fall)/2);
 if(rise>0 && p<rise) {
  return {
   value:speed*(p-rise*Math.sin(Math.PI*p/rise)/Math.PI)/2,
   slope:speed*(1-Math.cos(Math.PI*p/rise))/2,
  };
 }
 if(p>1-fall) {
  const q=p-(1-fall);
  return {
   value:speed*(1-fall-rise/2)+speed*(q+fall*Math.sin(Math.PI*q/fall)/Math.PI)/2,
   slope:speed*(1+Math.cos(Math.PI*q/fall))/2,
  };
 }
 return { value:speed*(p-rise/2), slope:speed };
}
