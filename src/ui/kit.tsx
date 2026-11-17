import * as stylex from "@stylexjs/stylex";
import { Show, SignInButton, UserButton } from "@clerk/react";
import type { ReactNode } from "react";
import { color, font } from "./tokens.stylex.ts";

// Shared pieces of the Ribbon look. The ribbon runs down every list, and a gift
// tag hangs on it for each gift that guests have fully claimed.

const MOBILE = "@media (max-width: 480px)";
const REDUCED = "@media (prefers-reduced-motion: reduce)";

// `wide` gives the landing page room on desktop. `afterSignIn` is where signing
// in from the header goes; without it, the visitor stays on the page.
export function Page({
  children,
  wide = false,
  afterSignIn,
}: {
  children: ReactNode;
  wide?: boolean;
  afterSignIn?: string;
}) {
  return (
    <main {...stylex.props(s.page)}>
      <div {...stylex.props(s.sheet, wide && s.wide)}>
        <header {...stylex.props(s.header)}>
          <a href="/" {...stylex.props(s.brand)}>
            <Bow size={22} />
            Ribbon
          </a>
          <Show when="signed-in">
            <UserButton />
          </Show>
          <Show when="signed-out">
            <SignInButton
              mode="modal"
              forceRedirectUrl={afterSignIn}
              signUpForceRedirectUrl={afterSignIn}
            >
              <button {...stylex.props(ui.button, ui.quiet, s.signIn)}>Sign in</button>
            </SignInButton>
          </Show>
        </header>
        {children}
      </div>
    </main>
  );
}

export function Ribbon({ children }: { children: ReactNode }) {
  return (
    <div {...stylex.props(s.ribbonWrap)}>
      <span aria-hidden {...stylex.props(s.ribbon)} />
      {children}
    </div>
  );
}

// The bow's shapes in a 40 × 28 box, knot at (20, 14).
function BowShapes() {
  return (
    <>
      <path d="M20 14C12 1 1 4 4 12s12 6 16 2Z" {...stylex.props(s.loop)} />
      <path d="M20 14C28 1 39 4 36 12s-12 6-16 2Z" {...stylex.props(s.loop)} />
      <path d="M19 15 12 27l4-1 4-9Zm2 0 7 12-4-1-4-9Z" {...stylex.props(s.knot)} />
      <circle cx="20" cy="14" r="3.6" {...stylex.props(s.knot)} />
    </>
  );
}

function Bow({ size = 38 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={(size * 28) / 40} viewBox="0 0 40 28">
      <BowShapes />
    </svg>
  );
}

// The gift tag a claimed gift hangs on the ribbon: a white tag with a small bow,
// on a string pinned at (20, 4), which is the ribbon's center. `swing` plays the
// entrance; pass it only for a gift that became taken while the page was open.
export function Tag({ swing = false }: { swing?: boolean }) {
  return (
    <svg aria-hidden width={56} height={64} viewBox="-6 -16 52 60" {...stylex.props(s.tagSvg)}>
      <g {...stylex.props(s.tag, swing && s.swing)}>
        <line x1="20" y1="4" x2="20" y2="13" {...stylex.props(s.string)} />
        <path
          d="M12 17 20 11 28 17V35a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2Z"
          {...stylex.props(s.tagCard)}
        />
        <circle cx="20" cy="16.5" r="1.6" {...stylex.props(s.string)} />
        <g transform="translate(20 27) scale(0.36) translate(-20 -14)">
          <BowShapes />
        </g>
      </g>
      <circle cx="20" cy="4" r="2.6" {...stylex.props(s.pin, swing && s.pinIn)} />
    </svg>
  );
}

// Swings in from the right and settles at the tag's resting tilt of -8°.
const swingIn = stylex.keyframes({
  "0%": { opacity: 0, transform: "rotate(75deg)" },
  "12%": { opacity: 1 },
  "35%": { transform: "rotate(-30deg)" },
  "55%": { transform: "rotate(12deg)" },
  "74%": { transform: "rotate(-14deg)" },
  "88%": { transform: "rotate(-5deg)" },
  "100%": { transform: "rotate(-8deg)" },
});

const pinIn = stylex.keyframes({
  from: { opacity: 0, transform: "scale(0)" },
  to: { opacity: 1, transform: "none" },
});

// Rows that sit on the ribbon. `tag` puts a Tag's pin on the ribbon's center.
export const row = stylex.create({
  base: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingBlock: 8,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.line,
  },
  // The Tag is 56 px wide with its pin 28 px in, and the ribbon's center is 39 px
  // (32 px on phones) left of the row.
  tag: {
    position: "absolute",
    left: { default: -67, [MOBILE]: -60 },
    top: "50%",
    marginTop: -32,
    display: "flex",
    pointerEvents: "none",
  },
});

export const ui = stylex.create({
  title: {
    margin: 0,
    fontFamily: font.title,
    fontSize: { default: 40, [MOBILE]: 32 },
    fontWeight: 500,
    fontVariationSettings: '"opsz" 72',
    lineHeight: 1.05,
    letterSpacing: "-0.015em",
    textWrap: "balance",
  },
  sub: { margin: "10px 0 28px", color: color.soft, maxWidth: "44ch", textWrap: "pretty" },
  soft: { color: color.soft },
  small: { fontSize: 14, color: color.soft, margin: 0 },
  error: { margin: 0, fontSize: 14, color: color.ribbonDark },
  field: {
    minWidth: 0,
    fontWeight: 400,
    paddingBlock: 9,
    paddingInline: 14,
    backgroundColor: color.sheet,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: color.line, ":hover": "#d9cdc6" },
    borderRadius: 999,
    outline: { default: "none", ":focus-visible": `2px solid ${color.focus}` },
    outlineOffset: 1,
  },
  button: {
    flexShrink: 0,
    paddingBlock: 8,
    paddingInline: 18,
    fontSize: 15,
    fontWeight: 600,
    whiteSpace: "nowrap",
    cursor: { default: "pointer", ":disabled": "default" },
    color: color.onRibbon,
    backgroundColor: { default: color.ribbon, ":hover": color.ribbonDark, ":disabled": color.line },
    borderStyle: "none",
    borderRadius: 999,
    transform: { default: null, ":active": "scale(0.97)" },
    outline: { default: "none", ":focus-visible": `2px solid ${color.focus}` },
    outlineOffset: 2,
  },
  quiet: {
    color: { default: color.ribbon, ":disabled": color.soft },
    backgroundColor: { default: "transparent", ":hover": "#f7e9eb", ":disabled": "transparent" },
    boxShadow: `inset 0 0 0 1px ${color.line}`,
    fontWeight: 500,
  },
  iconButton: {
    width: 36,
    height: 36,
    padding: 0,
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    fontSize: 18,
    lineHeight: 1,
    cursor: { default: "pointer", ":disabled": "default" },
    color: { default: color.soft, ":hover": color.ink, ":disabled": color.line },
    backgroundColor: "transparent",
    borderStyle: "none",
    borderRadius: 999,
    outline: { default: "none", ":focus-visible": `2px solid ${color.focus}` },
  },
  link: { color: color.ribbon, textUnderlineOffset: 3 },
});

const s = stylex.create({
  page: {
    minHeight: "100vh",
    paddingBlock: { default: 48, [MOBILE]: 0 },
    paddingInline: { default: 20, [MOBILE]: 0 },
    backgroundColor: color.paper,
    color: color.ink,
    fontFamily: font.body,
  },
  sheet: {
    maxWidth: 600,
    marginInline: "auto",
    minHeight: { default: null, [MOBILE]: "100vh" },
    paddingBlock: { default: 36, [MOBILE]: 28 },
    paddingInline: { default: 40, [MOBILE]: 20 },
    backgroundColor: color.sheet,
    borderRadius: { default: 8, [MOBILE]: 0 },
    boxShadow: { default: `0 0 0 1px ${color.line}`, [MOBILE]: "none" },
  },
  wide: { maxWidth: 960, paddingInline: { default: 56, [MOBILE]: 20 } },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 32,
    marginBottom: 28,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 15,
    fontWeight: 600,
    color: "inherit",
    textDecoration: "none",
  },
  signIn: { paddingBlock: 5, paddingInline: 14, fontSize: 14 },
  ribbonWrap: {
    position: "relative",
    paddingLeft: { default: 60, [MOBILE]: 50 },
  },
  ribbon: {
    position: "absolute",
    left: { default: 16, [MOBILE]: 13 },
    top: -10,
    bottom: -10,
    width: 10,
    backgroundColor: color.ribbon,
  },
  loop: { fill: color.ribbon },
  knot: { fill: color.ribbonDark },
  tagSvg: { display: "block", overflow: "visible" },
  tag: {
    transformBox: "view-box",
    transformOrigin: "20px 4px",
    transform: "rotate(-8deg)",
  },
  swing: {
    animationName: { default: swingIn, [REDUCED]: "none" },
    animationDuration: "1100ms",
    animationTimingFunction: "cubic-bezier(0.4, 0, 0.4, 1)",
    animationFillMode: "both",
  },
  string: { fill: "none", stroke: color.ink, strokeWidth: 1 },
  tagCard: {
    fill: color.sheet,
    stroke: color.ink,
    strokeWidth: 1.2,
    strokeLinejoin: "round",
  },
  pin: {
    fill: color.ribbonDark,
    stroke: color.sheet,
    strokeWidth: 1.6,
    transformBox: "view-box",
    transformOrigin: "20px 4px",
  },
  pinIn: {
    animationName: { default: pinIn, [REDUCED]: "none" },
    animationDuration: "160ms",
    animationTimingFunction: "ease-out",
    animationFillMode: "both",
  },
});

// The Backend answers errors with plain text meant for people. Anything else,
// such as an HTML 404 page when no Backend is running, gets a generic message.
export async function readError(response: Response) {
  return response.headers.get("content-type")?.startsWith("text/plain")
    ? response.text()
    : `Ribbon's server didn't answer (${response.status}). Try again in a moment.`;
}
