import { SignInButton, useAuth } from "@clerk/react";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ListEdit } from "../shared/wishlist.ts";
import { ListEditor } from "../ui/editor.tsx";
import { Page, readError, ui } from "../ui/kit.tsx";

// Making a list needs an account, so only you open it as the owner. A
// signed-out visitor sees a sign-in prompt instead of the form.

export const Route = createFileRoute("/new")({ component: NewList });

function NewList() {
  const navigate = useNavigate();
  const { isSignedIn, getToken } = useAuth();

  const create = async (list: ListEdit) => {
    const response = await fetch("/api/lists", {
      method: "POST",
      headers: { authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify(list),
    });
    if (!response.ok) return readError(response);
    const { listId } = (await response.json()) as { listId: string };
    await navigate({ to: "/lists/$listId", params: { listId } });
  };

  if (isSignedIn === undefined) return <Page>{null}</Page>;

  if (!isSignedIn)
    return (
      <Page>
        <h1 {...stylex.props(ui.title)}>Make a wish list</h1>
        <p {...stylex.props(ui.sub)}>
          Sign in to make a list, so only you open it as the owner. Guests need no account.
        </p>
        <SignInButton mode="modal">
          <button type="button" {...stylex.props(ui.button)}>
            Sign in
          </button>
        </SignInButton>
      </Page>
    );

  return (
    <Page>
      <h1 {...stylex.props(ui.title)}>Make a wish list</h1>
      <p {...stylex.props(ui.sub)}>Name the list, add the wishes, and share the link.</p>
      <ListEditor submit="Create list" submitting="Creating…" onSubmit={create} />
    </Page>
  );
}
