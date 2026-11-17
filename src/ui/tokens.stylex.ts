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

export const font = stylex.defineVars({
  title: '"Literata Variable", "Iowan Old Style", Palatino, Georgia, serif',
  body: '"Figtree Variable", "Avenir Next", system-ui, sans-serif',
});
