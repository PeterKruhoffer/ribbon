import { Show, SignInButton } from "@clerk/react";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClaimedGift, GiftTable, ShareLink, SpoilerTable, WishCard } from "../ui/figures.tsx";
import { Page, ui } from "../ui/kit.tsx";
import { color, font } from "../ui/tokens.stylex.ts";

// The landing page. Making a list happens on /new, behind sign-in, so signing
// in here goes straight there.

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <Page wide afterSignIn="/new">
      <div {...stylex.props(s.hero)}>
        <GiftTable style={s.heroFigure} />
        <div>
          <h1 {...stylex.props(ui.title)}>Make a wish list</h1>
          <p {...stylex.props(ui.sub)}>
            Share the link, and guests claim gifts so nobody buys the same one twice. You never see
            who claimed what.
          </p>
          <Show when="signed-in">
            <Link to="/new" {...stylex.props(ui.button, s.cta)}>
              Make a wish list
            </Link>
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal" forceRedirectUrl="/new" signUpForceRedirectUrl="/new">
              <button type="button" {...stylex.props(ui.button)}>
                Make a wish list
              </button>
            </SignInButton>
          </Show>
        </div>
      </div>

      <section aria-labelledby="how" {...stylex.props(s.section)}>
        <h2 id="how" {...stylex.props(s.heading)}>
          How Ribbon works
        </h2>
        <ol {...stylex.props(s.steps)}>
          <li {...stylex.props(s.step)}>
            <WishCard style={s.stepFigure} />
            <p {...stylex.props(s.stepText)}>
              Write the wishes
              <span {...stylex.props(ui.small)}>Socks, a board game, anything.</span>
            </p>
          </li>
          <li {...stylex.props(s.step)}>
            <ShareLink style={s.stepFigure} />
            <p {...stylex.props(s.stepText)}>
              Share the link
              <span {...stylex.props(ui.small)}>One link for every guest.</span>
            </p>
          </li>
          <li {...stylex.props(s.step)}>
            <ClaimedGift style={s.stepFigure} />
            <p {...stylex.props(s.stepText)}>
              Guests claim
              <span {...stylex.props(ui.small)}>Every guest sees it live.</span>
            </p>
          </li>
        </ol>
      </section>

      <section aria-labelledby="spoilers" {...stylex.props(s.section)}>
        <h2 id="spoilers" {...stylex.props(s.heading)}>
          Your surprise stays a surprise
        </h2>
        <p {...stylex.props(ui.sub)}>
          Guests see which gifts are taken. You see the same list with no bows, ever.
        </p>
        <div {...stylex.props(s.pair)}>
          <figure {...stylex.props(s.view)}>
            <SpoilerTable guest={false} style={s.spoilerFigure} />
            <figcaption {...stylex.props(s.stepText)}>
              Your view
              <span {...stylex.props(ui.small)}>Wishes, no claims</span>
            </figcaption>
          </figure>
          <figure {...stylex.props(s.view)}>
            <SpoilerTable guest style={s.spoilerFigure} />
            <figcaption {...stylex.props(s.stepText)}>
              Guest view
              <span {...stylex.props(ui.small)}>A bow on every claimed gift</span>
            </figcaption>
          </figure>
        </div>
      </section>
    </Page>
  );
}

const MOBILE = "@media (max-width: 480px)";
const DESKTOP = "@media (min-width: 760px)";

const s = stylex.create({
  hero: {
    display: "grid",
    gridTemplateColumns: { default: "1fr", [DESKTOP]: "minmax(0, 1fr) minmax(0, 1.1fr)" },
    alignItems: "center",
    gap: { default: 20, [DESKTOP]: 40 },
  },
  heroFigure: {
    maxWidth: { default: 400, [DESKTOP]: "none" },
    order: { default: 0, [DESKTOP]: 1 },
  },
  cta: { display: "inline-block", textDecoration: "none" },
  section: {
    marginTop: 56,
    paddingTop: 40,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.line,
  },
  heading: {
    margin: "0 0 8px",
    fontFamily: font.title,
    fontSize: { default: 28, [MOBILE]: 24 },
    fontWeight: 500,
    lineHeight: 1.1,
    letterSpacing: "-0.01em",
    textWrap: "balance",
  },
  steps: {
    listStyle: "none",
    margin: "20px 0 0",
    padding: 0,
    display: "grid",
    gridTemplateColumns: { default: "repeat(3, minmax(0, 1fr))", [MOBILE]: "1fr" },
    gap: { default: 16, [MOBILE]: 12 },
  },
  step: {
    display: { default: "grid", [MOBILE]: "flex" },
    alignItems: { default: "start", [MOBILE]: "center" },
    alignContent: "start",
    gap: { default: 10, [MOBILE]: 16 },
  },
  stepFigure: {
    height: { default: 104, [DESKTOP]: 132, [MOBILE]: 76 },
    width: { default: "100%", [MOBILE]: 104 },
    flexShrink: 0,
  },
  stepText: { display: "grid", gap: 2, margin: 0, fontWeight: 600, fontSize: 15 },
  pair: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: { default: 20, [MOBILE]: 12 } },
  spoilerFigure: { maxWidth: 360 },
  view: { display: "grid", alignContent: "start", gap: 10, margin: 0, minWidth: 0 },
});
