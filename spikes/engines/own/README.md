# Own engine (spike)

React's reconciler on our own renderer: Yoga lays out, Skia (CanvasKit, on WebGL) paints. There is no DOM and no CSS: a frame is a React component tree of the primitives below, styled with React Native style objects.

```tsx
import { useState, useEffect } from "react";
import { View, Text, Pressable, Image, Svg, Path, Circle, Rect, G } from "own";

export default function Frame() {
  const [on, setOn] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: "#0b0b0c", padding: 24, gap: 12 }}>
      <Text style={{ color: "#fff", fontFamily: "Inter", fontSize: 24, fontWeight: 600 }}>Hello</Text>
      <Pressable onPress={() => setOn(!on)} style={{ padding: 12, borderRadius: 8, backgroundColor: on ? "#22c55e" : "#27272a" }}>
        <Text style={{ color: "#fff" }}>{on ? "On" : "Off"}</Text>
      </Pressable>
    </View>
  );
}
```

## Primitives

- `View`: a box. Layout is flexbox (column by default, like React Native). Events: `onPress`, `onHoverIn`, `onHoverOut`.
- `Pressable`: a `View` (same props); use it for anything clickable.
- `Text`: text. Nest `Text` inside `Text` for inline runs with their own style. Text inside a `View` inherits nothing: style every `Text`. `numberOfLines` truncates with an ellipsis.
- `Image`: `source={{ uri }}`, `resizeMode` `cover` | `contain` | `stretch`, sized by style.
- `Svg` with `viewBox`, `width`, `height`, `color` (used for `currentColor`), and children `Path` (`d`), `Circle` (`cx cy r`), `Rect` (`x y width height rx`), `G`; each takes `fill`, `stroke`, `strokeWidth`, `strokeLinecap`, `strokeLinejoin`.

## Style

- Layout: `flex`, `flexDirection`, `flexWrap`, `flexGrow`, `flexShrink`, `flexBasis`, `justifyContent`, `alignItems`, `alignSelf`, `alignContent`, `gap`, `rowGap`, `columnGap`, `width`, `height`, `min/maxWidth`, `min/maxHeight`, `aspectRatio`, `padding*`, `margin*` (numbers in px, or `"50%"`), `position: "absolute"` with `top/left/right/bottom/inset`, `zIndex`, `display: "none"`, `overflow: "hidden"` (clips children, rounded).
- Paint: `backgroundColor`, `backgroundImage: "linear-gradient(135deg, #a 0%, #b 100%)"` (linear only), `borderWidth`, `borderColor`, `borderStyle: "dashed"`, `border{Top,Bottom,Left,Right}Width/Color`, `borderRadius` and per-corner radii, `boxShadow` (CSS syntax, several, `inset` works), `opacity`, `transform: [{ translateX }, { translateY }, { scale }, { rotate: "12deg" }]`.
- Text: `color`, `fontFamily` (`"Inter"`, `"Instrument Sans"`, `"Fragment Mono"`), `fontSize`, `fontWeight` (100 to 900), `fontStyle`, `lineHeight` (px), `letterSpacing`, `textAlign`, `textDecorationLine`, `textTransform: "uppercase"`, `fontVariant: ["tabular-nums"]`.
- Colours: hex, `rgb()`, `rgba()`, `hsl()`.

## Not there

No CSS, no `className`, no CSS animations or transitions, no blur or backdrop filters, no text input, no scrolling, no radial gradients. Animate with React state driven by `requestAnimationFrame` or `setInterval` (every change re-lays out and repaints the frame).

## Preview

```sh
node /home/liam/agent-hub/worktrees/spool/325-research-task-for-spool-219-cata-s-idea/spikes/engines/own/shot.mjs <frame.tsx> <width> <height> <out.png> [wait ms] [click x,y ...]
```

Prints JSON with any page errors; clicks are spread over the wait.
