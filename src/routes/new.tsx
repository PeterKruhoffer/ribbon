import { SignInButton, useAuth } from "@clerk/react";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Option, Schema } from "effect";
import { CreatedList, type ListEdit, unreadableAnswer } from "../shared/wishlist.ts";
import { ListEditor } from "../ui/editor.tsx";
import { Page, readError, ui } from "../ui/kit.tsx";

const decodeCreated = Schema.decodeUnknownOption(CreatedList);

// Making a list needs an account, so only you open it as the owner. A
// signed-out visitor sees a sign-in prompt instead of the form.

export const Route = createFileRoute("/new")({ component: NewList });

function NewList() {
  const navigate = useNavigate();
  const { isSignedIn, getToken } = useAuth();

  const create = async (list: ListEdit) => {
    const response = await fetch("/api/lists", {
      method: "POST",
      headers: { authorization: `Bearer ${await getToken()}`, "content-type": "application/json" },
      body: JSON.stringify(list),
    });
    if (!response.ok) return readError(response);
    const created = decodeCreated(await response.json());
    if (Option.isNone(created)) return unreadableAnswer;
    await navigate({ to: "/lists/$listId", params: { listId: created.value.listId } });
  };

  if (isSignedIn === undefined) return <Page>{null}</Page>;

  if (!isSignedIn)
    return (
      <Page>
        <h1 {...stylex.props(ui.title)}>Lav en ønskeliste</h1>
        <p {...stylex.props(ui.sub)}>
          Log ind for at lave en liste, så kun du åbner den som ejer. Gæster behøver ingen konto.
        </p>
        <SignInButton mode="modal">
          <button type="button" {...stylex.props(ui.button)}>
            Log ind
          </button>
        </SignInButton>
      </Page>
    );

  return (
    <Page>
      <h1 {...stylex.props(ui.title)}>Lav en ønskeliste</h1>
      <p {...stylex.props(ui.sub)}>Giv listen et navn, tilføj ønskerne, og del linket.</p>
      <ListEditor submit="Opret liste" submitting="Opretter…" onSubmit={create} />
    </Page>
  );
}
