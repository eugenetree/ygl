/**
 * A search's player and clip list, in one structure for every layout. CSS
 * alone switches between the layouts, so the YouTube player is never
 * remounted, not even when a tablet is rotated.
 *
 * - Side list (`side:`): the player column beside the list, which scrolls in
 *   its own box exactly as tall as the column. The video is narrow enough for
 *   the column to fit the window, so the header and the column's other parts,
 *   a one-line shortcuts row included, must take at most 380px of its height.
 * - Sticky player, otherwise: the video, controls and caption pinned above the
 *   list, letting go when it ends. No title row and no shortcuts.
 * - Short screens: nothing is pinned, and the list scrolls with the page.
 */
export function ClipsLayout({
  title,
  video,
  controls,
  touchControls,
  caption,
  shortcuts,
  heading,
  clips,
  more,
}: {
  title: React.ReactNode;
  /** The video and its progress bar. */
  video: React.ReactNode;
  controls: React.ReactNode;
  touchControls: React.ReactNode;
  caption: React.ReactNode;
  shortcuts?: React.ReactNode;
  heading: React.ReactNode;
  /** The list's `li` items. */
  clips: React.ReactNode;
  more?: React.ReactNode;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[1280px] side:grid side:grid-cols-[minmax(0,max(472px,calc((100dvh-380px)*16/9)))_minmax(300px,360px)] side:items-start side:justify-center side:gap-x-6 side:px-6 side:pt-3 side:pb-6">
      <div className="sticky top-0 z-10 border-b bg-background shadow-pinned sm:px-5 sm:pt-4 side:static side:z-auto side:flex side:flex-col side:gap-3 side:border-0 side:bg-transparent side:p-0 side:shadow-none short:static">
        <div className="hidden side:block">{title}</div>
        <div className="overflow-hidden sm:rounded-t-[10px] side:rounded-xl side:border side:shadow-card">
          {video}
          <div className="hidden side:block">{controls}</div>
          <div className="side:hidden">{touchControls}</div>
        </div>
        {caption}
        {shortcuts && (
          <div className="hidden side:pointer-fine:block">{shortcuts}</div>
        )}
      </div>
      {/* Contained in size so only the player column sets the row's height. */}
      <section className="px-2 pt-4 pb-6 sm:px-4 side:flex side:flex-col side:self-stretch side:p-0 side:contain-size short:contain-none">
        <header className="flex flex-col gap-0.5 px-2 pb-1.5 sm:px-1 sm:pt-1 sm:pb-2.5">
          {heading}
        </header>
        {/* Padded so the rows' focus rings aren't clipped by the scroll box. */}
        <div
          data-clip-scroller=""
          className="side:-mx-1 side:min-h-0 side:flex-1 side:overflow-y-auto side:p-1 side:[scrollbar-width:thin] short:overflow-y-visible"
        >
          <ol className="flex flex-col gap-0.5 sm:grid sm:grid-cols-2 sm:gap-x-3 side:flex">
            {clips}
          </ol>
          {more}
        </div>
      </section>
    </div>
  );
}

/**
 * Scrolls a list item fully into view within the list's own box, as a `ref`.
 * `scrollIntoView` would scroll the page as well. Outside the side list the
 * box doesn't scroll, so this does nothing.
 */
export function revealInList(item: HTMLElement | null) {
  const scroller = item?.closest("[data-clip-scroller]");
  if (!item || !scroller) return;
  const box = scroller.getBoundingClientRect();
  const { paddingTop, paddingBottom } = getComputedStyle(scroller);
  const top = box.top + Number.parseFloat(paddingTop);
  const bottom = box.bottom - Number.parseFloat(paddingBottom);
  const row = item.getBoundingClientRect();
  if (row.top < top) scroller.scrollBy({ top: row.top - top });
  else if (row.bottom > bottom) scroller.scrollBy({ top: row.bottom - bottom });
}
