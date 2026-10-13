/** A search page's state when it has no clips to show. */
export function SearchMessage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col items-center gap-4 px-4 py-[10vh] text-center text-muted-foreground">
      <h1 className="text-xl font-semibold tracking-[-0.01em] text-balance break-words text-foreground">
        {title}
      </h1>
      {children}
    </section>
  );
}
