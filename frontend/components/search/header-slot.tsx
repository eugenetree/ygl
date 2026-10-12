"use client";

import { createContext, use, useState } from "react";
import { createPortal } from "react-dom";

type Slot = {
  element: HTMLElement | null;
  setElement: (element: HTMLElement | null) => void;
};

const HeaderSlotContext = createContext<Slot | null>(null);

/**
 * Lets a page show its own content in the header, which lives in a layout
 * above it and can't read the page's state.
 */
export function HeaderSlotProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  return (
    <HeaderSlotContext value={{ element, setElement }}>
      {children}
    </HeaderSlotContext>
  );
}

/** Where `InHeader` content goes. Its children lay out as the header's own. */
export function HeaderSlot() {
  const slot = use(HeaderSlotContext);
  return <div ref={slot?.setElement} className="contents" />;
}

/** Renders its children in the header's slot, once the page has hydrated. */
export function InHeader({ children }: { children: React.ReactNode }) {
  const slot = use(HeaderSlotContext);
  return slot?.element ? createPortal(children, slot.element) : null;
}
