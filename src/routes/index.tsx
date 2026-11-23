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
          <h1 {...stylex.props(ui.title)}>Lav en ønskeliste</h1>
          <p {...stylex.props(ui.sub)}>
            Del linket, så reserverer gæsterne gaver, og ingen køber den samme to gange. Du ser
            aldrig, hvem der har reserveret hvad.
          </p>
          <Show when="signed-in">
            <Link to="/new" {...stylex.props(ui.button, s.cta)}>
              Lav en ønskeliste
            </Link>
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal" forceRedirectUrl="/new" signUpForceRedirectUrl="/new">
              <button type="button" {...stylex.props(ui.button)}>
                Lav en ønskeliste
              </button>
            </SignInButton>
          </Show>
        </div>
      </div>

      <section aria-labelledby="how" {...stylex.props(s.section)}>
        <h2 id="how" {...stylex.props(s.heading)}>
          Sådan virker Ribbon
        </h2>
        <ol {...stylex.props(s.steps)}>
          <li {...stylex.props(s.step)}>
            <WishCard style={s.stepFigure} />
            <p {...stylex.props(s.stepText)}>
              Skriv ønskerne
              <span {...stylex.props(ui.small)}>Sokker, et brætspil, hvad som helst.</span>
            </p>
          </li>
          <li {...stylex.props(s.step)}>
            <ShareLink style={s.stepFigure} />
            <p {...stylex.props(s.stepText)}>
              Del linket
              <span {...stylex.props(ui.small)}>Ét link til alle gæster.</span>
            </p>
          </li>
          <li {...stylex.props(s.step)}>
            <ClaimedGift style={s.stepFigure} />
            <p {...stylex.props(s.stepText)}>
              Gæsterne reserverer
              <span {...stylex.props(ui.small)}>Alle gæster ser det med det samme.</span>
            </p>
          </li>
        </ol>
      </section>

      <section aria-labelledby="spoilers" {...stylex.props(s.section)}>
        <h2 id="spoilers" {...stylex.props(s.heading)}>
          Din overraskelse forbliver en overraskelse
        </h2>
        <p {...stylex.props(ui.sub)}>
          Gæsterne ser, hvilke gaver der er taget. Du ser den samme liste helt uden sløjfer.
        </p>
        <div {...stylex.props(s.pair)}>
          <figure {...stylex.props(s.view)}>
            <SpoilerTable guest={false} style={s.spoilerFigure} />
            <figcaption {...stylex.props(s.stepText)}>
              Din visning
              <span {...stylex.props(ui.small)}>Ønsker, ingen reservationer</span>
            </figcaption>
          </figure>
          <figure {...stylex.props(s.view)}>
            <SpoilerTable guest style={s.spoilerFigure} />
            <figcaption {...stylex.props(s.stepText)}>
              Gæstens visning
              <span {...stylex.props(ui.small)}>En sløjfe på hver reserveret gave</span>
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
