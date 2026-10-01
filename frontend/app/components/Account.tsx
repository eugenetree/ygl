"use client";

import { useEffect, useRef, useState } from "react";
import type { MeResponse } from "@api/contract";
import { getMe } from "../lib/api";
import { authClient } from "../lib/auth-client";

export default function Account() {
  // undefined until /api/me answers, so the header doesn't flash a sign-in
  // button at a signed-in listener.
  const [me, setMe] = useState<MeResponse | null | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("idle");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      setDeleteStep("idle");
      return;
    }
    function onPointerDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function signIn() {
    const here = window.location.href;
    authClient.signIn.social({
      provider: "google",
      callbackURL: here,
      errorCallbackURL: here,
    });
  }

  async function signOut() {
    setMenuOpen(false);
    const { error } = await authClient.signOut();
    if (!error) setMe(null);
  }

  async function deleteAccount() {
    setDeleteStep("deleting");
    const { error } = await authClient.deleteUser();
    if (!error) {
      setMenuOpen(false);
      setMe(null);
      return;
    }
    // better-auth only deletes from a session signed in within the last day.
    setDeleteStep(error.code === "SESSION_EXPIRED" ? "stale-session" : "failed");
  }

  if (me === undefined) return <div className="g-account-slot" aria-hidden="true" />;

  if (me === null) {
    return (
      <button className="g-signin" onClick={signIn}>
        <GoogleMark />
        Sign in with Google
      </button>
    );
  }

  return (
    <div className="g-account" ref={menuRef}>
      <button
        className="g-avatar"
        aria-label={`Account menu for ${me.name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        {me.avatarUrl ? (
          // Google's avatar host refuses some requests that carry a referrer.
          <img src={me.avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span>{me.name.charAt(0).toUpperCase()}</span>
        )}
      </button>
      {menuOpen && (
        <div className="g-account-menu" role="menu">
          <div className="g-account-who">
            <b>{me.name}</b>
            <span>{me.email}</span>
          </div>
          {deleteStep === "idle" ? (
            <>
              <button className="g-account-item" role="menuitem" onClick={signOut}>
                Sign out
              </button>
              <button
                className="g-account-item g-account-danger"
                role="menuitem"
                onClick={() => setDeleteStep("confirming")}
              >
                Delete account
              </button>
            </>
          ) : (
            <DeleteConfirmation
              step={deleteStep}
              onCancel={() => setDeleteStep("idle")}
              onConfirm={deleteAccount}
              onSignInAgain={signIn}
            />
          )}
        </div>
      )}
    </div>
  );
}

type DeleteStep = "idle" | "confirming" | "deleting" | "failed" | "stale-session";

function DeleteConfirmation({
  step,
  onCancel,
  onConfirm,
  onSignInAgain,
}: {
  step: Exclude<DeleteStep, "idle">;
  onCancel: () => void;
  onConfirm: () => void;
  onSignInAgain: () => void;
}) {
  if (step === "stale-session") {
    return (
      <div className="g-account-confirm" role="alertdialog" aria-label="Sign in again">
        <p>For your security, sign in again, then delete your account.</p>
        <div className="g-account-actions">
          <button className="g-account-item" onClick={onCancel}>
            Cancel
          </button>
          <button className="g-account-item" onClick={onSignInAgain}>
            Sign in again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="g-account-confirm" role="alertdialog" aria-label="Delete account">
      <p>
        {step === "failed"
          ? "Your account couldn't be deleted. Try again in a moment."
          : "Delete your account? You'll be signed out everywhere. Signing in with Google later starts a new account."}
      </p>
      <div className="g-account-actions">
        <button className="g-account-item" onClick={onCancel} disabled={step === "deleting"}>
          Cancel
        </button>
        <button
          className="g-account-item g-account-danger"
          onClick={onConfirm}
          disabled={step === "deleting"}
          autoFocus
        >
          {step === "deleting" ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
