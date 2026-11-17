import * as stylex from "@stylexjs/stylex";

// The Ribbon look: white sheets on warm paper, one ribbon red, Literata for
// titles and Figtree for everything else. src/styles.css loads both fonts.

export const color = stylex.defineVars({
  paper: "#faf6f3",
  sheet: "#ffffff",
  ink: "#26201c",
  soft: "#6f6560",
  line: "#ece4df",
  ribbon: "#b0243a",
  ribbonDark: "#8a1b2d",
  onRibbon: "#ffffff",
  focus: "#1d4ed8",
});

// Fills for the isometric figures in src/ui/figures.tsx: shades of the ribbon
// red for wrapped gifts, and warm grays for the sides of plain boxes.
export const figure = stylex.defineVars({
  wash: "#fbeef0",
  pale: "#f4d3d8",
  shade: "#e8b7bf",
  muted: "#e39aa5",
  left: "#f5eee9",
  right: "#e9ded7",
  rule: "#cfc3bc",
});

export const font = stylex.defineVars({
  title: '"Literata Variable", "Iowan Old Style", Palatino, Georgia, serif',
  body: '"Figtree Variable", "Avenir Next", system-ui, sans-serif',
});
