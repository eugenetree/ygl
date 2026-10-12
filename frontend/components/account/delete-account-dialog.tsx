"use client";

import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useSetSignedOut } from "@/components/account/use-me";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteAccount, signIn } from "@/lib/account";

type Step = "confirming" | "deleting" | "failed" | "session-expired";

const CONFIRM = {
  title: "Delete your account?",
  description:
    "You'll be signed out everywhere. Signing in with Google later starts a new account.",
};

const STEPS: Record<
  Step,
  { title: string; description: string; action: string }
> = {
  confirming: { ...CONFIRM, action: "Delete account" },
  deleting: { ...CONFIRM, action: "Deleting…" },
  failed: {
    title: CONFIRM.title,
    description: "Your account couldn't be deleted. Try again in a moment.",
    action: "Try again",
  },
  "session-expired": {
    title: "Sign in again to delete your account",
    description: "For your security, sign in again, then delete your account.",
    action: "Sign in again",
  },
};

export function DeleteAccountDialog({
  open,
  onOpenChange,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The dialog opens from a menu item that is gone by the time it closes. */
  returnFocusTo: React.RefObject<HTMLElement | null>;
}) {
  const setSignedOut = useSetSignedOut();
  const [step, setStep] = useState<Step>("confirming");
  // Reset on opening rather than closing, so the closing dialog keeps its text.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStep("confirming");
  }

  async function handleDelete() {
    setStep("deleting");
    const result = await deleteAccount();
    if (result === "deleted") {
      onOpenChange(false);
      setSignedOut();
      toast("Your account was deleted");
    } else {
      setStep(result);
    }
  }

  const isDeleting = step === "deleting";
  const { title, description, action } = STEPS[step];

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!isDeleting) onOpenChange(next);
      }}
    >
      <AlertDialogContent
        className="rounded-lg border bg-surface shadow-pop ring-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusTo.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription aria-live="polite">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="rounded-b-lg">
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          {step === "session-expired" ? (
            <Button onClick={signIn}>{action}</Button>
          ) : (
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting && (
                <Loader2Icon aria-hidden className="animate-spin" />
              )}
              {action}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
