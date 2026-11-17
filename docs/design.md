# Design

The Ribbon look puts a white sheet on warm paper and uses one ribbon red. A red ribbon runs down every list, and a bow ties onto it for each gift that guests have fully claimed. The owner sees the ribbon without bows, so the page never spoils who claimed what.

Hand-drawn isometric figures of gift boxes, a wish card, and a phone illustrate the landing page (hero, "How Ribbon works", and the spoiler promise), the loading and "List not found" states, and a guest's claim, where a small gift gets its ribbon and bow. `src/ui/figures.tsx` draws them as inline SVG in shades of the ribbon red from the `figure` tokens, so they scale to any width and change with the tokens. To add one, draw it with the `Draw` helpers there instead of adding an image file.

Titles use Literata and everything else uses Figtree. Both fonts are self-hosted from `@fontsource-variable`, so the site never loads fonts from a CDN.

## Styling

- Style components with StyleX (`@stylexjs/stylex`). Do not add inline `style` props or other CSS libraries.
- Colors and fonts live in `src/ui/tokens.stylex.ts` as `defineVars`. Use the tokens instead of writing hex values in components.
- `src/ui/kit.tsx` holds the shared pieces: `Page`, `Ribbon`, `Bow`, the `row` styles for lines on the ribbon, and `ui` styles for titles, fields, and buttons. `src/ui/figures.tsx` holds the illustrations.
- `src/styles.css` holds only the font imports and the page reset.
- Write borders as longhands (`borderWidth`, `borderStyle`, `borderColor`, `borderBottomWidth`, and so on). StyleX 0.19 drops the `border` and `borderBottom` shorthands without an error.

## How the CSS is built

`@stylexjs/unplugin` runs first in `vite.config.ts`. In a build, it appends every StyleX rule to the `styles.css` asset. In dev, `src/routes/__root.tsx` links `/virtual:stylex.css` and loads `virtual:stylex:runtime`, which reloads the CSS on change.

StyleX re-emits `styles.css` under a new hash but leaves the old name in the chunks' `importedAssets`, which Alchemy copies at deploy. The `ribbon:stylex-asset-names` plugin in `vite.config.ts` points those entries at the renamed file. Without it, `pnpm run deploy` fails with a missing `styles-*.css`.
