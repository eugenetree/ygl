import { useEffect, useEffectEvent } from "react";

/**
 * Handlers by key: `event.key`, with letters lower-cased, e.g. `"k"`, `" "`,
 * `"ArrowRight"` or `"/"`.
 */
export type Shortcuts = Partial<Record<string, () => void>>;

// Where keys type, or move through and pick from a menu or dialog.
const OWNS_KEYS =
  "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role=menu], [role=listbox], [role=dialog], [role=alertdialog]";

const PRESSABLE =
  "button, a[href], summary, [role=button], [role=switch], [role=checkbox], [role=menuitem]";

/** Runs the shortcut for a key, if it has one. Whether it did. */
type KeyHandler = (
  event: KeyboardEvent,
  isFocusFromPointer: boolean,
) => boolean;

// Every useShortcuts on the page shares one set of window listeners.
const handlers = new Set<KeyHandler>();
let isPointerInput = false;
let isFocusFromPointer = false;
let isSpaceTaken = false;

const onPointerDown = () => {
  isPointerInput = true;
};
const onFocusIn = () => {
  isFocusFromPointer = isPointerInput;
};
// Before the focused element's own handlers, which would open a menu whose
// trigger was clicked.
const onKeyDown = (event: KeyboardEvent) => {
  let isTaken = false;
  for (const handle of handlers) {
    isTaken = handle(event, isFocusFromPointer);
    if (isTaken) break;
  }
  isPointerInput = false;
  if (event.key === " ") isSpaceTaken = isTaken;
};
// A focused button is pressed when Space comes back up.
const onKeyUp = (event: KeyboardEvent) => {
  if (event.key !== " " || !isSpaceTaken) return;
  isSpaceTaken = false;
  event.preventDefault();
};

const OPTIONS = { capture: true };

function listen() {
  window.addEventListener("pointerdown", onPointerDown, OPTIONS);
  window.addEventListener("focusin", onFocusIn, OPTIONS);
  window.addEventListener("keydown", onKeyDown, OPTIONS);
  window.addEventListener("keyup", onKeyUp, OPTIONS);
}

function stopListening() {
  window.removeEventListener("pointerdown", onPointerDown, OPTIONS);
  window.removeEventListener("focusin", onFocusIn, OPTIONS);
  window.removeEventListener("keydown", onKeyDown, OPTIONS);
  window.removeEventListener("keyup", onKeyUp, OPTIONS);
}

/**
 * Runs a shortcut for a key pressed anywhere on the page. Keys are left alone
 * with Ctrl, Alt or Meta held, and where focus needs them: a text field, a
 * menu, a dialog, or Space on a control reached by keyboard, which presses
 * it. After a click, Space is the shortcut's, not the clicked control's. Keys
 * pressed in the YouTube player never reach the page.
 */
export function useShortcuts(shortcuts: Shortcuts) {
  const handleKeyDown = useEffectEvent(
    (event: KeyboardEvent, isFocusFromPointer: boolean): boolean => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      ) {
        return false;
      }
      const shortcut = shortcuts[keyOf(event)];
      if (!shortcut || isKeyOwnedByFocus(event, isFocusFromPointer)) {
        return false;
      }
      event.preventDefault();
      shortcut();
      return true;
    },
  );

  useEffect(() => {
    if (handlers.size === 0) listen();
    handlers.add(handleKeyDown);
    return () => {
      handlers.delete(handleKeyDown);
      if (handlers.size === 0) stopListening();
    };
  }, []);
}

function isKeyOwnedByFocus(
  event: KeyboardEvent,
  isFocusFromPointer: boolean,
): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.closest(OWNS_KEYS)) return true;
  return (
    event.key === " " &&
    !isFocusFromPointer &&
    target.closest(PRESSABLE) !== null
  );
}

/**
 * With a non-Latin layout, a letter key gives that layout's letter, so the
 * key's place on a US keyboard is used instead.
 */
function keyOf(event: KeyboardEvent): string {
  const { key, code } = event;
  if (key.length !== 1) return key;
  if (/[a-z]/i.test(key)) return key.toLowerCase();
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter && key.charCodeAt(0) > 127) return letter[1].toLowerCase();
  return key;
}
