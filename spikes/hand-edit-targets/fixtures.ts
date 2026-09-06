export const button = `export function Button({ label }: { label: string }) {
  return <button className="px-4 bg-brand"><span className="text-sm">{label}</span><i>Save</i></button>;
}
export function Unused() { return <aside>Unused export</aside>; }
export function Pair() { return <><b>One</b><b>Two</b></>; }
export function Empty() { return null; }
export function Upper({ label }: { label: string }) { return <span>{label.toUpperCase()}</span>; }
export function Child({ children }: { children: React.ReactNode }) { return <strong>{children}</strong>; }
`;
export const nested = `import { Button } from "./button";
export function Shell({ label }: { label: string }) { return <section><Button label={label} /></section>; }
`;
export const first = `import { useState } from "react";
import { Button, Pair, Empty, Upper, Child, Unused } from "shared/ui/button";
import { Shell } from "shared/ui/shell";
export default function Frame() {
  const [items, setItems] = useState([{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }]);
  const [show, setShow] = useState(false);
  return <main>
    <h1 className="p-4">Local title</h1>
    <Button label="Download Mac" />
    <Button label="Download Windows" />
    <Shell label="Nested" />
    <Pair />
    <Empty />
    <Upper label="transformed" />
    <Child>Literal child</Child>
    {show && <Button label="Conditional" />}
    <div id="rows">{items.map(item => <Button key={item.id} label={item.label} />)}</div>
    <div id="unkeyed">{items.map(item => <Button label={item.label} />)}</div>
    <button id="reverse" onClick={() => setItems([...items].reverse())}>Reverse</button>
    <button id="toggle" onClick={() => setShow(!show)}>Toggle</button>
  </main>;
}
`;
export const second = `import { Button } from "shared/ui/button";
export default function Frame() { return <Button label="Other frame" />; }
`;
export const unused = `import { Button } from "shared/ui/button";
export default function Frame() { return <p>No button</p>; }
`;
export const tokens = `:root { --brand: #123456; --space-step: 0.5rem; }
@theme inline { --color-brand: var(--brand); --spacing-rhythm: var(--space-step); }
@theme { --spacing: 0.25rem; --radius-panel: 1.25rem; --breakpoint-wide: 60rem; }
`;
