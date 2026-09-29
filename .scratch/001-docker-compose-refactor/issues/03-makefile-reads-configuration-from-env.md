# 03 — Read Postgres and R2 configuration from `.env` in the Makefile

**What to build:** A developer who changes `POSTGRES_DB` in `.env` gets a
Makefile that talks to the database the stack is actually running, and a
developer who points at a different R2 folder changes one variable rather than
editing a shell pipeline in two places.

The Makefile already includes and exports `.env`, and its R2 targets already use
the credential variables — but the database targets write `admin` out eight
times and `saythis` seven, and the R2 targets hardcode the bucket and folder
that `.env.example` documents variables for. They work today only because the
working `.env` happens to hold exactly those values. Change `POSTGRES_DB` and
compose builds a stack against the new database while every Makefile target
keeps talking to the old one — `db-reset` would drop a database nothing is using
and leave the live one untouched.

Two things stay literal. The maintenance database in the drop-and-create recipes
is not the project's database: it is the connection you must use *because* you
are dropping the project's, and substituting it breaks the recipe. The container
names passed to `docker exec` are compose service names, not configuration.

The Postgres password is deliberately not introduced anywhere. These recipes run
inside the container over a local socket that the official Postgres image trusts
without one, so adding it would imply a dependency that does not exist.

Targets guard their variables, which is the Makefile counterpart of compose
refusing to start on a missing one. Without it a missing `.env` turns a user
flag into an empty string and the developer gets a usage error that names
nothing. One pattern rule covers every target:

```make
guard-%:
	@test -n "$($*)" || { echo "$* is not set — see .env.example"; exit 1; }
```

Note that against the current `.env` this whole change is a no-op — every
resolved recipe is byte-identical before and after, because `.env` already holds
`admin` and `saythis`. That makes it safe, and it also makes a correct
substitution indistinguishable from a broken one by running the targets.
Temporarily changing the database name is the only way to observe that it took
effect, which is why that criterion is listed separately.

`R2_FOLDER` is documented in `.env.example` but absent from the working `.env`.
It has to land there first or the download target starts listing the bucket
root.

**Blocked by:** None — can start immediately. Independent of 01 and 02.

**Status:** ready-for-agent

- [ ] No literal `admin` or `saythis` remains in any recipe
- [ ] The five database targets — connect, export, load-dump, restore and reset
      — take the user and database name from `.env`
- [ ] The maintenance database in the drop-and-create recipes is still literal
- [ ] The container names passed to `docker exec` are unchanged
- [ ] The Postgres password is not referenced by any recipe
- [ ] A `guard-%` pattern rule exists; the database targets guard the user and
      database name, and the R2 download target guards its bucket, folder,
      endpoint and both credentials
- [ ] Both occurrences of the hardcoded R2 path resolve from the bucket and
      folder variables
- [ ] `R2_FOLDER` is present in `.env` with the value the path currently
      hardcodes
- [ ] `make -n` on each of the five database targets and on the R2 download
      target resolves byte-identically to the previous commit, against the
      unchanged `.env`
- [ ] Temporarily changing the database name in `.env` makes `make -n db-reset`
      name the new database in both the drop and the create, while still
      connecting to the maintenance database
- [ ] Commenting out the Postgres user in `.env` makes each guarded target fail
      naming that variable rather than reaching `psql`
