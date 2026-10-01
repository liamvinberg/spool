/* The characters the field is made of: four frames of a small shop, written the
 * way an agent writes them, plus the shared pieces they import. Plain ASCII so
 * every glyph is in the atlas. */

export const CART = `import { Sheet, Row, Button } from "shared/ui/shop";
import { useBag } from "shared/lib/bag";

export default function Cart() {
  const bag = useBag();
  return (
    <Sheet title="Your bag">
      {bag.items.map((item) => (
        <Row key={item.id} label={item.name}>
          {item.qty} x {item.price}
        </Row>
      ))}
      <Row label="Subtotal">{bag.subtotal}</Row>
      <Button data-go="checkout">
        Check out
      </Button>
    </Sheet>
  );
}`;

export const CHECKOUT = `import { useState } from "react";
import { Sheet, Field, Button } from "shared/ui/shop";

export default function Checkout() {
  const [step, setStep] = useState(1);
  return (
    <Sheet title="Checkout">
      {step === 1 ? (
        <>
          <Field label="Name" auto="name" />
          <Field label="Address" auto="street" />
          <Field label="Postcode" auto="postal" />
        </>
      ) : (
        <Field label="Email" auto="email" />
      )}
      <Button onClick={() => setStep(2)}>
        Continue
      </Button>
      <Button data-go="pay" hidden={step < 2}>
        Pay now
      </Button>
    </Sheet>
  );
}`;

export const PAY = `import { Sheet, Card } from "shared/ui/shop";

export default function Pay() {
  return (
    <Sheet title="Pay">
      <Card number="4242 4242" />
      <Card wallet="apple" />
      <Button data-go="receipt">
        Pay 1 240 kr
      </Button>
    </Sheet>
  );
}`;

export const RECEIPT = `import { Sheet, Row } from "shared/ui/shop";
import { useOrder } from "shared/lib/order";

export default function Receipt() {
  const order = useOrder();
  return (
    <Sheet title={"Order " + order.number}>
      <Row label="Arrives">{order.eta}</Row>
      <Row label="Paid">{order.total}</Row>
      <Button data-go="cart">
        Keep shopping
      </Button>
    </Sheet>
  );
}`;

const SHARED = `export function Sheet({ title, children }) {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-medium">{title}</h1>
      <div className="mt-8 grid gap-3">{children}</div>
    </main>
  );
}

export function Row({ label, children }) {
  return (
    <div className="flex justify-between py-2">
      <span className="text-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

export function Field({ label, auto }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm">{label}</span>
      <input autoComplete={auto} className="h-11 px-3" />
    </label>
  );
}

export function Button({ children, ...rest }) {
  return (
    <button className="h-12 rounded bg-ink text-paper" {...rest}>
      {children}
    </button>
  );
}

export function useBag() {
  const [items, setItems] = useState(seed.items);
  const subtotal = items.reduce((n, i) => n + i.qty * i.price, 0);
  return { items, setItems, subtotal: format(subtotal) };
}

const format = (n) => n.toLocaleString("sv-SE") + " kr";`;

/** Everything, one line after another, for the field's background. */
export const STREAM = [CHECKOUT, SHARED, CART, PAY, RECEIPT].join("\n\n").split("\n");
