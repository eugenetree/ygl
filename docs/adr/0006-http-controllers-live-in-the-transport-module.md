# HTTP controllers live in the transport module, not in feature folders

Controllers for the HTTP API live in `src/modules/api/`, the same way Telegram
controllers live in `src/modules/telegram/`. Feature modules such as
`captions-search` hold use cases, repositories and domain types, and never
import Fastify or Telegraf. In hexagonal terms the transport modules are the
driving adapters and the feature modules are the core; the folder boundary is
the hexagon boundary.

## Considered options

- **Vertical slices (package by feature)**, where `favorites/` would hold its
  use cases *and* its `favorites.http.controller.ts` and
  `favorites.telegram.controller.ts`. A legitimate layout with better locality,
  and a close call. Rejected for the two reasons below, not because it lets
  framework code into the core: a lint rule scoped to `*.http.controller.ts`
  could keep it out just as well.
- **Nesting domain logic under `api/`** (`api/favorites/` with its use cases).
  Rejected outright: the first non-HTTP consumer, such as a scheduled job, would
  import business logic from "the API".

## Why

- **Precedent.** The Telegram module already groups its controllers by
  transport. Slices for HTTP alone would leave two conventions side by side, or
  force moving every Telegram controller for no behavioural gain.
- **One contract folder.** Every route's request, response and error schemas
  live as zod schemas in one folder under the HTTP module. The frontend imports
  their types through a single path alias, and the OpenAPI document is generated
  from them. Slices would scatter those schemas across features and need a
  barrel to gather them back.

## Consequences

- Adding or deleting a feature touches two places: its feature module and its
  controller under `api/` (or `telegram/`).
- Once `api/` holds around ten controllers, give each its own subfolder rather
  than revisiting this decision.
