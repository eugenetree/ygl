# Coding Conventions

**Analysis Date:** 2026-07-26

## Naming Patterns

**Files:**
- PascalCase for class files: `ChannelPriorityCalculator.ts`
- camelCase for utility/factory files: `caption-analysis.service.ts`, `push-channel.use-case.ts`
- Suffix pattern by type:
  - `.service.ts` for injectable services (`captions.service.ts`)
  - `.use-case.ts` for application use cases (`find-channels.use-case.ts`)
  - `.repository.ts` for data access (`channel.repository.ts`)
  - `.queue.ts` for job queues (`channel-entries.queue.ts`)
  - `.worker.ts` for queue workers (`search-channel-queries.worker.ts`)
  - `.calculator.ts` for calculation logic (`channel-priority.calculator.ts`)
  - `.validator.ts` for validation logic (`auto-captions.validator.ts`)
  - `.extractor.ts` for data extraction (`channel-info.extractor.ts`)
  - `.parser.ts` for parsing logic (`video-duration.parser.ts`)
  - `.test.ts` or `.spec.ts` for test files

**Functions:**
- camelCase for all function names and methods
- Private methods prefixed with `private`: `private resolveAutoStatus()`
- Async functions clearly marked with `async` keyword
- Method names descriptive of action: `calculate()`, `execute()`, `validate()`, `analyze()`

**Variables:**
- camelCase for all variables: `videoId`, `channelId`, `totalProcessed`
- Const for immutable values: `const baseStats = {...}`
- Descriptive names over short abbreviations (except for well-known domain terms)
- Boolean variables prefix with `is`, `has`, `should`, `can`: `isBoosted`, `languageGateActive`

**Types:**
- PascalCase for all type/interface names: `ChannelStats`, `PriorityScores`, `Result<Value, Error>`
- Branded discriminated unions for domain types: `AutoCaptionsStatus`, `ManualCaptionsStatus`
- Type suffixes for clarity: `...Props`, `...Result`, `...Error`
- Use `type` keyword for type aliases, not `interface`

## Code Style

**Formatting:**
- Tool: Biome v2.4.16
- Indentation: 2 spaces
- Line width: 80 characters
- Quote style: double quotes (`"`)
- Trailing commas: all

**Linting:**
- Tool: Biome recommended rules (enabled)
- Exception: `useImportType` disabled (allows regular imports vs. `import type`)
- Migrations override: disable `noExplicitAny` for `src/db/migrations/**`

**TypeScript Configuration:**
- Target: ES2022
- Strict mode enabled (`strict: true`)
- `experimentalDecorators` and `emitDecoratorMetadata` enabled (for inversify support)
- `forceConsistentCasingInFileNames` enabled
- Module system: commonjs

## Import Organization

**Order:**
1. Node.js built-in imports: `import fs from "node:fs"`, `import assert from "node:assert/strict"`
2. External packages: `import { injectable } from "inversify"`, `import axios from "axios"`
3. Internal modules with full paths: `import { Logger } from "../_common/logger/logger.js"`
4. Always use `.js` extension for internal imports (required for ESM/TypeScript compatibility)

**Path Aliases:**
- No path aliases configured; use relative paths only
- Import paths respect module boundaries (e.g., cannot import internal types from external modules)

**Import Statements:**
- Use named imports where possible: `import { Success, Failure } from "../../types/index.js"`
- Use default imports for classes/services when single main export
- Always include `.js` extension for TypeScript files in imports

## Error Handling

**Patterns:**
- Result type pattern: `Result<Value, Error>` with `Success()` and `Failure()` constructors
- All async operations that can fail return `Promise<Result<T, E>>`
- Error checking via `.ok` property: `if (!result.ok) return result;`
- Explicit error types with `type` discriminator: `{ type: "DATABASE", message: "..." }`
- Error chaining via `cause` property for nested errors

**Example:**
```typescript
const result = await repository.findById(id);
if (!result.ok) return result;  // Early exit with error

return Success({ status: "ADDED" });
```

**Try-catch utility:**
- `tryCatch<T, E>()` function in `src/modules/_common/try-catch.ts` converts promises to Result type
- Used for wrapping third-party promise-based APIs

## Logging

**Framework:** Custom Logger class in `src/modules/_common/logger/logger.ts`

**Configuration:**
- Takes `context` (service-specific marker) and `category` (overall application) as constructor params
- Context converted to kebab-case automatically: `ApiServer` → `api-server`
- Logs written to `logs/` directory by category

**Methods:**
- `logger.info(message: string)` - Information messages
- `logger.error({ message?: string, error?: unknown, context?: Record })` - Error logging with stack trace and cause serialization
- `logger.warn(message: string)` - Warning messages
- `logger.setContext(context: string)` - Append to context chain for nested scopes
- `logger.child(config: Config)` - Create child logger with new context

**Usage:**
```typescript
constructor(private readonly logger: Logger) {
  this.logger.setContext(ClassName.name);
}

this.logger.info("Operation started");
this.logger.error({ message: "Failed", error: err, context: { userId } });
```

## Comments

**When to Comment:**
- Complex algorithms that aren't self-documenting: `// High-frequency words add noise in matching...`
- Business logic gates/thresholds: `// exactly 10% = at threshold = penalty`
- Non-obvious error recovery: `// Remove speaker labels (e.g., "Sapnap:", "George:")`
- Avoid comments for obvious code; let code be self-documenting

**JSDoc/TSDoc:**
- Minimal documentation comments used
- Only document public APIs with complex behavior
- One-liner comments preferred over verbose blocks
- Use `type` comments for type inference when needed: `as Logger` type assertions

## Function Design

**Size:**
- Aim for functions under 50 lines
- Break complex logic into private helper functions or methods
- Single Responsibility: each function does one thing

**Parameters:**
- Use object parameters for multiple related arguments:
  ```typescript
  analyze({ autoCaptions, manualCaptions }: { ... })
  ```
- Destructure complex objects in function signature
- Max 3-5 positional parameters before switching to object

**Return Values:**
- Always return wrapped Results for fallible operations: `Promise<Result<T, E>>`
- Return early for error paths
- Use TypeScript discriminated unions for result variants

## Module Design

**Exports:**
- Use named exports for classes and types
- Single class per file is standard
- Barrel files (`index.ts`) export public API with `export { ... } from "..."`

**Module Structure:**
- `src/modules/_common/` - Shared utilities (Logger, Result types, validation helpers)
- `src/modules/{domain}/` - Domain-specific logic with use-cases, services, repositories
- Inversify decorators (`@injectable()`) on all classes meant for DI container
- Constructor dependency injection for all collaborators

**Example module layout:**
```
src/modules/scraping/push-channel/
├── push-channel.use-case.ts          # Main use case
├── push-channel.use-case.test.ts     # Tests
└── boosted-channels.repository.ts    # Data access
```

**Dependency Direction:**
- Use cases depend on repositories and services
- Services can depend on other services and utilities
- Repositories depend only on database client
- No circular imports (enforced by module boundaries)

## Class and Object Patterns

**Classes:**
- Use for complex stateful objects and services
- Mark with `@injectable()` for DI container registration
- Constructor injection of dependencies (never field injection)
- Private fields for internal state, public for API surface

**Type Objects:**
- Use `type` keyword for data contracts and domain types
- Discriminated unions for variant types: `{ type: "ADDED" } | { type: "PRIORITIZED" }`
- Readonly properties for immutable data structures

**Decorators:**
- `@injectable()` on all service classes
- `@inject(Logger)` on constructors for named bindings (rare, see `export-logs.use-case.ts`)
- Parameter decorators for Inversify container lookups

## Constants

**Naming:**
- UPPER_SNAKE_CASE for module-level constants
- `src/modules/scraping/channel-priority/channel-priority.constants.ts` pattern for grouped constants

**Patterns:**
- Validation thresholds and algorithm weights grouped by domain
- Example: `PRIORITY_CAPTION_THRESHOLD`, `PRIORITY_SUBS_CAP`, `PRIORITY_MANUAL_BOOST`

---

*Convention analysis: 2026-07-26*
