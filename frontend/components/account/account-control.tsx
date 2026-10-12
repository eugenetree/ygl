"use client";

import type { MeResponse } from "@api/contract";
import { LogInIcon, LogOutIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { DeleteAccountDialog } from "@/components/account/delete-account-dialog";
import { useMe, useSetSignedOut } from "@/components/account/use-me";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signIn, signOut } from "@/lib/account";

/**
 * "Sign in", or the signed-in listener's avatar and account menu. Icon-sized
 * outside the side-list layout.
 */
export function AccountControl() {
  const { data: me, isPending } = useMe();
  // Sized like "Sign in", which most visitors see, so it rarely shifts.
  if (isPending) return <div aria-hidden className="size-8 side:w-[71px]" />;
  return me ? <AccountMenu me={me} /> : <SignInButton />;
}

function SignInButton() {
  return (
    <Button
      variant="outline"
      onClick={signIn}
      className="size-8 rounded-md bg-transparent px-0 hover:bg-tint side:w-auto side:px-3 dark:bg-transparent dark:hover:bg-tint"
    >
      <LogInIcon aria-hidden className="side:hidden" />
      <span className="sr-only side:not-sr-only">Sign in</span>
    </Button>
  );
}

function AccountMenu({ me }: { me: MeResponse }) {
  const setSignedOut = useSetSignedOut();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  async function handleSignOut() {
    if (await signOut()) setSignedOut();
    else toast("Couldn't sign out. Try again.");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            aria-label="Account"
            className="rounded-full"
          >
            <Avatar className="size-7">
              {me.avatarUrl && (
                <AvatarImage
                  src={me.avatarUrl}
                  alt=""
                  // Google's avatar host refuses some requests that carry a
                  // referrer.
                  referrerPolicy="no-referrer"
                />
              )}
              <AvatarFallback className="text-xs font-medium">
                {me.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-64 rounded-lg border bg-surface shadow-pop ring-0"
        >
          <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-[7px] font-normal">
            <span className="truncate text-sm font-medium text-foreground">
              {me.name}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {me.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={handleSignOut}
            className="rounded-sm px-2 py-[7px]"
          >
            <LogOutIcon aria-hidden />
            Sign out
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setIsDeleteOpen(true)}
            className="rounded-sm px-2 py-[7px]"
          >
            <Trash2Icon aria-hidden />
            Delete account…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteAccountDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        returnFocusTo={triggerRef}
      />
    </>
  );
}
