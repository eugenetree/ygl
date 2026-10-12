"use client";

import { cn } from "cn";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { Suspense } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ACCENTS,
  type Accent,
  DEFAULT_ACCENT,
  switchAccent,
  useAccent,
} from "@/lib/accent";
import { useShortcuts } from "@/lib/use-shortcuts";

type TriggerProps = React.ComponentProps<"button"> & { accent: Accent };

/** The accent picker inside home's search box, after the input. */
export function HeroAccentPicker() {
  return <AccentPicker trigger={(accent) => <HeroTrigger accent={accent} />} />;
}

/**
 * The accent picker of the search page's header: a chip inside the search
 * box on phones, the name inside it on tablets, and a button beside it in
 * the side-list layout.
 */
export function HeaderAccentPicker() {
  return (
    <AccentPicker trigger={(accent) => <HeaderTrigger accent={accent} />} />
  );
}

/**
 * The accent button and its menu, also picked with keys 1–5. The accent lives
 * in the URL, which only the browser reads, so the server renders American.
 */
function AccentPicker({
  trigger,
}: {
  trigger: (accent: Accent) => React.ReactElement;
}) {
  return (
    <Suspense fallback={trigger(DEFAULT_ACCENT)}>
      <AccentMenu trigger={trigger} />
    </Suspense>
  );
}

function AccentMenu({
  trigger,
}: {
  trigger: (accent: Accent) => React.ReactElement;
}) {
  const accent = useAccent();
  useShortcuts(
    Object.fromEntries(
      ACCENTS.map((option, index) => [
        String(index + 1),
        () => switchAccent(option),
      ]),
    ),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger(accent)}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[200px] rounded-lg border bg-surface shadow-pop ring-0"
      >
        <DropdownMenuLabel className="px-2 py-1.5">Accent</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={accent.code}
          onValueChange={(code) => {
            const picked = ACCENTS.find((option) => option.code === code);
            if (picked) switchAccent(picked);
          }}
        >
          {ACCENTS.map((option) => (
            <DropdownMenuPrimitive.RadioItem
              key={option.code}
              value={option.code}
              className="flex cursor-default items-center gap-2 rounded-sm px-2 py-[7px] text-sm outline-hidden select-none focus:bg-accent"
            >
              <span className="flex w-3.5 shrink-0 justify-center">
                <DropdownMenuPrimitive.ItemIndicator>
                  <CheckIcon aria-hidden className="size-3.5" />
                </DropdownMenuPrimitive.ItemIndicator>
              </span>
              <span className="flex-1">{option.name}</span>
              <span className="font-mono text-[11px] text-faint uppercase">
                {option.code}
              </span>
            </DropdownMenuPrimitive.RadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HeroTrigger({ accent, className, ...props }: TriggerProps) {
  return (
    <TriggerButton
      accent={accent}
      className={cn("h-[34px] gap-1.5 border-l px-2.5", className)}
      {...props}
    >
      {accent.name}
      <ChevronDownIcon aria-hidden className="size-3.5 text-faint" />
    </TriggerButton>
  );
}

function HeaderTrigger({ accent, className, ...props }: TriggerProps) {
  return (
    <TriggerButton
      accent={accent}
      className={cn(
        "rounded-md border px-[7px] py-[3px] text-xs sm:gap-1.5 sm:rounded-none sm:border-0 sm:border-l sm:px-2.5 sm:py-0 sm:text-[13px] side:h-9 side:rounded-md side:border side:bg-surface side:text-sm side:hover:bg-tint",
        className,
      )}
      {...props}
    >
      <span className="uppercase sm:hidden">{accent.code}</span>
      <span className="max-sm:hidden">{accent.name}</span>
      <ChevronDownIcon
        aria-hidden
        className="size-3.5 text-faint max-sm:hidden"
      />
    </TriggerButton>
  );
}

function TriggerButton({ accent, className, ...props }: TriggerProps) {
  return (
    <button
      type="button"
      aria-label={`Accent: ${accent.name}`}
      className={cn(
        "flex shrink-0 items-center font-medium whitespace-nowrap text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}
