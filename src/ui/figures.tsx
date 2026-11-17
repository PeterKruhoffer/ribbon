import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { color, figure } from "./tokens.stylex.ts";

// Hand-drawn isometric figures: gift boxes, a wish card, and a phone on small
// tables, drawn only in shades of the ribbon red. Each figure is an inline SVG
// that scales to its container, and its viewBox fits the drawing.

const REDUCED = "@media (prefers-reduced-motion: reduce)";

type Pt = readonly [x: number, y: number, z: number];
type Fill = keyof typeof fills;
type Faces = { top: Fill; left: Fill; right: Fill };

const CREAM: Faces = { top: "sheet", left: "left", right: "right" };
const PINK: Faces = { top: "wash", left: "pale", right: "shade" };
const SCREEN: Faces = { top: "ink", left: "soft", right: "soft" };

// One unit in the scene is 10 SVG units. x runs down to the right, y down to the
// left, and z up.
const UNIT = 10;

class Draw {
  parts: ReactNode[] = [];
  private x0 = Infinity;
  private y0 = Infinity;
  private x1 = -Infinity;
  private y1 = -Infinity;

  private grow(px: number, py: number) {
    this.x0 = Math.min(this.x0, px);
    this.x1 = Math.max(this.x1, px);
    this.y0 = Math.min(this.y0, py);
    this.y1 = Math.max(this.y1, py);
  }

  point([x, y, z]: Pt): [number, number] {
    const px = (x - y) * 0.866 * UNIT;
    const py = (x + y) * 0.5 * UNIT - z * UNIT;
    this.grow(px, py);
    return [px, py];
  }

  viewBox(pad: number) {
    const r = (n: number) => Math.round(n);
    return `${r(this.x0 - pad)} ${r(this.y0 - pad)} ${r(this.x1 - this.x0 + pad * 2)} ${r(this.y1 - this.y0 + pad * 2)}`;
  }

  private add(node: (key: number) => ReactNode) {
    this.parts.push(node(this.parts.length));
  }

  // Wraps everything drawn inside `draw` in one group, such as for an animation.
  group(style: stylex.StyleXStyles, draw: () => void) {
    const start = this.parts.length;
    draw();
    const inner = this.parts.splice(start);
    this.add((key) => (
      <g key={key} {...stylex.props(style)}>
        {inner}
      </g>
    ));
  }

  poly(points: Pt[], fill: Fill, width = 1.2) {
    const d = points
      .map((p) =>
        this.point(p)
          .map((n) => n.toFixed(1))
          .join(","),
      )
      .join(" ");
    this.add((key) => (
      <polygon key={key} points={d} strokeWidth={width} {...stylex.props(fills[fill], f.edge)} />
    ));
  }

  line(a: Pt, b: Pt, stroke: keyof typeof strokes) {
    const [x1, y1] = this.point(a);
    const [x2, y2] = this.point(b);
    this.add((key) => (
      <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} {...stylex.props(strokes[stroke], f.rule)} />
    ));
  }

  box(x: number, y: number, z: number, w: number, d: number, h: number, faces = CREAM) {
    this.poly(
      [
        [x, y + d, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x, y + d, z + h],
      ],
      faces.left,
    );
    this.poly(
      [
        [x + w, y, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x + w, y, z + h],
      ],
      faces.right,
    );
    this.poly(
      [
        [x, y, z + h],
        [x + w, y, z + h],
        [x + w, y + d, z + h],
        [x, y + d, z + h],
      ],
      faces.top,
    );
  }

  // The ribbon crossing a box: two bands over the top and down the visible sides.
  bands(x: number, y: number, z: number, w: number, d: number, h: number) {
    const b = 0.35;
    const cx = x + w / 2;
    const cy = y + d / 2;
    const t = z + h;
    this.poly(
      [
        [x + w, cy - b, z],
        [x + w, cy + b, z],
        [x + w, cy + b, t],
        [x + w, cy - b, t],
      ],
      "ribbon",
      1,
    );
    this.poly(
      [
        [cx - b, y + d, z],
        [cx + b, y + d, z],
        [cx + b, y + d, t],
        [cx - b, y + d, t],
      ],
      "ribbon",
      1,
    );
    this.poly(
      [
        [x, cy - b, t],
        [x + w, cy - b, t],
        [x + w, cy + b, t],
        [x, cy + b, t],
      ],
      "ribbon",
      1,
    );
    this.poly(
      [
        [cx - b, y, t],
        [cx + b, y, t],
        [cx + b, y + d, t],
        [cx - b, y + d, t],
      ],
      "ribbon",
      1,
    );
  }

  // The bow from kit.tsx, standing on a point in the scene.
  bow(at: Pt, scale: number, style?: stylex.StyleXStyles) {
    const [px, py] = this.point(at);
    this.grow(px - 20 * scale, py - 30 * scale);
    this.grow(px + 20 * scale, py);
    const tx = (px - 20 * scale).toFixed(1);
    const ty = (py - 16 * scale).toFixed(1);
    this.add((key) => (
      <g key={key} {...stylex.props(style)}>
        <g
          transform={`translate(${tx},${ty}) scale(${scale})`}
          strokeWidth={(1 / scale).toFixed(2)}
          {...stylex.props(f.edge)}
        >
          <path d="M20 14C12 1 1 4 4 12s12 6 16 2Z" {...stylex.props(fills.ribbon)} />
          <path d="M20 14C28 1 39 4 36 12s-12 6-16 2Z" {...stylex.props(fills.ribbon)} />
          <path d="M19 15 12 27l4-1 4-9Zm2 0 7 12-4-1-4-9Z" {...stylex.props(fills.ribbonDark)} />
          <circle cx="20" cy="14" r="3.6" {...stylex.props(fills.ribbonDark)} />
        </g>
      </g>
    ));
  }

  gift(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
    {
      faces = CREAM,
      bow,
      scale = 0.55,
    }: { faces?: Faces; bow?: stylex.StyleXStyles | true; scale?: number } = {},
  ) {
    this.box(x, y, z, w, d, h, faces);
    this.bands(x, y, z, w, d, h);
    if (bow) this.bow([x + w / 2, y + d / 2, z + h], scale, bow === true ? undefined : bow);
  }

  // Text printed on a face: "left" faces the viewer on the left, "top" lies flat.
  text(face: "left" | "top", at: Pt, value: string, size: number, fill: Fill = "ink") {
    const [px, py] = this.point(at);
    const m = face === "left" ? "0.866,0.5,0,1" : "0.866,0.5,-0.866,0.5";
    this.add((key) => (
      <text
        key={key}
        transform={`matrix(${m},${px.toFixed(1)},${py.toFixed(1)})`}
        fontSize={size}
        {...stylex.props(f.text, fills[fill])}
      >
        {value}
      </text>
    ));
  }

  // A label on the front left edge of a table.
  tag(x: number, y: number, z: number, w: number, value: string, fill: Fill = "sheet") {
    this.poly(
      [
        [x, y, z],
        [x + w, y, z],
        [x + w, y, z + 0.9],
        [x, y, z + 0.9],
      ],
      fill,
      1,
    );
    this.text("left", [x + 0.35, y, z + 0.18], value, 5.6);
  }

  // A wish list standing up, with a checkbox and a line per wish.
  card(x: number, y: number, z: number, w: number, h: number, checks: boolean[]) {
    this.box(x, y, z, w, 0.3, h);
    const front = y + 0.3;
    checks.forEach((on, i) => {
      const row = z + h - 1.1 - i * 1.15;
      this.poly(
        [
          [x + 0.5, front, row],
          [x + 1.1, front, row],
          [x + 1.1, front, row + 0.6],
          [x + 0.5, front, row + 0.6],
        ],
        on ? "ribbon" : "sheet",
        0.9,
      );
      this.line(
        [x + 1.5, front, row + 0.3],
        [x + w - 0.6 - (i % 2) * 1.2, front, row + 0.3],
        on ? "muted" : "rule",
      );
    });
  }

  // A loose length of ribbon, drawn as a curve on the page.
  loose(points: [Pt, Pt, Pt, Pt]) {
    const [a, b, c, e] = points.map((p) => this.point(p).join(","));
    const d = `M${a} C${b} ${c} ${e}`;
    this.add((key) => (
      <g key={key}>
        <path d={d} {...stylex.props(f.looseEdge)} />
        <path d={d} {...stylex.props(f.looseRibbon)} />
      </g>
    ));
  }
}

function Figure({
  draw,
  pad = 8,
  style,
}: {
  draw: (d: Draw) => void;
  pad?: number;
  style?: stylex.StyleXStyles;
}) {
  const d = new Draw();
  draw(d);
  return (
    <svg aria-hidden viewBox={d.viewBox(pad)} {...stylex.props(f.svg, style)}>
      {d.parts}
    </svg>
  );
}

type FigureProps = { style?: stylex.StyleXStyles };

// The landing page hero: gifts and a wish list on a table, with the ribbon
// running across it. Each bow ties on in turn.
export function GiftTable({ style }: FigureProps) {
  return (
    <Figure
      style={style}
      draw={(d) => {
        d.box(0, 0, 0, 16, 11, 0.9);
        d.poly(
          [
            [0, 5, 0.9],
            [16, 5, 0.9],
            [16, 6, 0.9],
            [0, 6, 0.9],
          ],
          "ribbon",
          1,
        );
        d.poly(
          [
            [16, 5, 0],
            [16, 6, 0],
            [16, 6, 0.9],
            [16, 5, 0.9],
          ],
          "ribbon",
          1,
        );
        d.tag(1, 11, 0.02, 5.6, "NO SPOILERS");
        d.gift(1.5, 0.8, 0.9, 4.2, 3.6, 3.4, { faces: PINK, bow: [f.pop, f.first] });
        d.gift(8, 0.8, 0.9, 3.2, 3.2, 5.2, { bow: [f.pop, f.second] });
        d.card(1.5, 7.2, 0.9, 5.2, 4.4, [true, true, false]);
        d.gift(10.5, 6.6, 0.9, 3.6, 3, 2.4, { faces: PINK, bow: [f.pop, f.third] });
      }}
    />
  );
}

// Step 1 of "How Ribbon works": write the wishes.
export function WishCard({ style }: FigureProps) {
  return (
    <Figure
      pad={4}
      style={style}
      draw={(d) => {
        d.box(0, 0, 0, 8, 6, 0.7);
        d.card(1, 2.6, 0.7, 5.6, 5, [true, false, true, false]);
      }}
    />
  );
}

// Step 2: share the link, on a phone lying on the table.
export function ShareLink({ style }: FigureProps) {
  return (
    <Figure
      pad={4}
      style={style}
      draw={(d) => {
        d.box(0, 0, 0, 8, 6, 0.7);
        d.box(1.2, 1.1, 0.7, 5.6, 3.8, 0.5, SCREEN);
        d.poly(
          [
            [1.55, 1.45, 1.21],
            [6.45, 1.45, 1.21],
            [6.45, 4.55, 1.21],
            [1.55, 4.55, 1.21],
          ],
          "sheet",
          0.8,
        );
        d.poly(
          [
            [1.9, 2, 1.22],
            [6.1, 2, 1.22],
            [6.1, 3, 1.22],
            [1.9, 3, 1.22],
          ],
          "pale",
          0.8,
        );
        d.text("top", [2.15, 2.75, 1.22], "/lists/demo", 4.4, "ribbonDark");
        d.poly(
          [
            [3.6, 3.4, 1.22],
            [6.1, 3.4, 1.22],
            [6.1, 4.1, 1.22],
            [3.6, 4.1, 1.22],
          ],
          "ribbon",
          0.8,
        );
      }}
    />
  );
}

// Step 3: a claimed gift with its bow.
export function ClaimedGift({ style }: FigureProps) {
  return (
    <Figure
      pad={4}
      style={style}
      draw={(d) => {
        d.box(0, 0, 0, 8, 6, 0.7);
        d.tag(0.6, 6, 0.02, 3.6, "CLAIMED", "pale");
        d.gift(2, 1.2, 0.7, 4, 3.4, 3.2, { faces: PINK, bow: true, scale: 0.6 });
      }}
    />
  );
}

// The same table as the owner and as a guest sees it: guests see bows on
// claimed gifts, and the owner sees none.
export function SpoilerTable({ guest, style }: FigureProps & { guest: boolean }) {
  return (
    <Figure
      pad={6}
      style={style}
      draw={(d) => {
        // Leave room above the back gift for its bow, so both views are the same size.
        d.point([2.8, 2.3, 5.6]);
        d.box(0, 0, 0, 11, 8, 0.8);
        d.tag(
          0.8,
          8,
          0.02,
          guest ? 5.4 : 4.4,
          guest ? "GUESTS SEE" : "YOU SEE",
          guest ? "pale" : "sheet",
        );
        d.gift(1, 0.8, 0.8, 3.6, 3, 3, {
          faces: guest ? PINK : CREAM,
          bow: guest ? [f.pop, f.first] : undefined,
        });
        d.gift(6, 0.8, 0.8, 3, 3, 4.2);
        d.gift(2.2, 4.6, 0.8, 4, 2.6, 2, {
          faces: guest ? PINK : CREAM,
          bow: guest ? [f.pop, f.second] : undefined,
        });
      }}
    />
  );
}

// "List not found": an open, empty box, its lid set aside and its ribbon loose.
export function OpenBox({ style }: FigureProps) {
  return (
    <Figure
      style={style}
      draw={(d) => {
        d.box(0, 0, 0, 15, 11, 0.8);
        d.tag(8.5, 11, 0.02, 5, "NOT FOUND");
        const [x, y, z, w, depth, h, i] = [1.5, 1.2, 0.8, 4.6, 4, 3.4, 0.25];
        const t = z + h;
        d.box(x, y, z, w, depth, h, PINK);
        d.poly(
          [
            [x + i, y + i, t],
            [x + w - i, y + i, t],
            [x + w - i, y + depth - i, t],
            [x + i, y + depth - i, t],
          ],
          "muted",
          1,
        );
        d.poly(
          [
            [x + i, y + i, t],
            [x + i, y + depth - i, t],
            [x + i, y + depth - i, t - 1.6],
            [x + i, y + i, t - 1.6],
          ],
          "pale",
          1,
        );
        d.poly(
          [
            [x + i, y + i, t],
            [x + w - i, y + i, t],
            [x + w - i, y + i, t - 1.6],
            [x + i, y + i, t - 1.6],
          ],
          "wash",
          1,
        );
        d.box(1.2, 6.3, 0.8, 5.2, 4.4, 0.7, PINK);
        d.loose([
          [x + w, y + depth / 2, t - 0.6],
          [10, 3, 0.8],
          [13.5, 2, 0.8],
          [15, 7.5, 0.3],
        ]);
      }}
    />
  );
}

// While a list loads: a wrapped gift that has no bow yet.
export function WrappedGift({ style }: FigureProps) {
  return (
    <Figure
      pad={4}
      style={style}
      draw={(d) => {
        d.box(0, 0, 0, 7, 6, 0.6);
        d.gift(1.4, 1.2, 0.6, 3.8, 3.4, 3, { faces: PINK });
      }}
    />
  );
}

// After a guest claims a gift: the ribbon wraps the box, then the bow ties on.
// Render it with a new key for each claim so the animation plays again.
export function ClaimGift({ style }: FigureProps) {
  return (
    <Figure
      pad={4}
      style={style}
      draw={(d) => {
        d.box(0, 0, 0, 7, 6, 0.6);
        d.box(1.4, 1.2, 0.6, 3.8, 3.4, 3, PINK);
        d.group(f.wrap, () => d.bands(1.4, 1.2, 0.6, 3.8, 3.4, 3));
        d.bow([3.3, 2.9, 3.6], 0.55, [f.pop, f.afterWrap]);
      }}
    />
  );
}

const pop = stylex.keyframes({
  from: { opacity: 0, transform: "scale(1.5) rotate(-12deg)" },
  to: { opacity: 1, transform: "none" },
});

const fade = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

const fills = stylex.create({
  sheet: { fill: color.sheet },
  left: { fill: figure.left },
  right: { fill: figure.right },
  wash: { fill: figure.wash },
  pale: { fill: figure.pale },
  shade: { fill: figure.shade },
  muted: { fill: figure.muted },
  rule: { fill: figure.rule },
  ribbon: { fill: color.ribbon },
  ribbonDark: { fill: color.ribbonDark },
  ink: { fill: color.ink },
  soft: { fill: color.soft },
});

const strokes = stylex.create({
  muted: { stroke: figure.muted },
  rule: { stroke: figure.rule },
});

const f = stylex.create({
  svg: { display: "block", width: "100%", height: "auto", overflow: "visible" },
  edge: { stroke: color.ink, strokeLinejoin: "round" },
  rule: { strokeWidth: 1.2, strokeLinecap: "round" },
  text: {
    fontFamily: "ui-monospace, Menlo, monospace",
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  looseEdge: { fill: "none", stroke: color.ink, strokeWidth: 7, strokeLinecap: "round" },
  looseRibbon: { fill: "none", stroke: color.ribbon, strokeWidth: 5, strokeLinecap: "round" },
  pop: {
    transformBox: "fill-box",
    transformOrigin: "50% 70%",
    animationName: { default: pop, [REDUCED]: "none" },
    animationDuration: "260ms",
    animationTimingFunction: "cubic-bezier(0.2, 0.9, 0.3, 1.3)",
    animationFillMode: "both",
  },
  first: { animationDelay: "200ms" },
  second: { animationDelay: "500ms" },
  third: { animationDelay: "800ms" },
  afterWrap: { animationDelay: "300ms" },
  wrap: {
    animationName: { default: fade, [REDUCED]: "none" },
    animationDuration: "250ms",
    animationTimingFunction: "ease-out",
    animationFillMode: "both",
  },
});
