# Miqyas (مقياس)

Web app that digitally administers a psychology professor's 2002 assessment: ~50 multiple-choice items (grammar + comprehension), adaptive difficulty, automatic stop after N consecutive incorrect answers (default 4), and performance tracking across sessions. An examiner runs it with a participant (often a child) on a tablet or laptop. Must support Arabic (RTL) and English.

Stack: Next.js (App Router) + TypeScript strict + Tailwind + shadcn/ui, pnpm, Vitest, zod, ESLint + Prettier. Planned: Supabase (Postgres + Auth), Vercel (free tiers). UI will later come from v0 via `npx shadcn add <v0 link>`, so keep the scaffold standard and the UI minimal.

## Ground rules

1. **No real items in the repo, ever.** The items belong to the professor. Only clearly fake placeholders (`lib/engine/placeholder-items.ts`). Private files `items.private.*` and `data/private/` are gitignored.
2. **No participant names or identifying data** in code, tests, fixtures, logs or commits. Use opaque IDs.
3. **Every rule is configurable, nothing hard-coded**: starting item by age/grade, basal rule, ceiling/stop rule, scoring. The rules are pending confirmation with the professor. Defaults live in `lib/engine/config.ts`; add new rules as config fields validated by zod.
4. **The engine is pure TypeScript** in `lib/engine/`: no React, no database, no `Date.now()`/`Math.random()` in logic (pass timestamps in). Same inputs give same outputs.
5. **Event-sourced**: every answer is stored as a `ResponseEvent`; session state and score are derived from events, so any session can be replayed and rescored (`replay`).

## Structure

```
app/                 Next.js routes (app/dev/engine = dev-only engine playground)
components/ui/       shadcn/ui components
lib/engine/          pure assessment engine (types, config, engine, placeholder-items)
lib/engine/__tests__ Vitest unit tests
lib/utils.ts         shadcn cn() helper
```

## Commands

- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm test` (Vitest), `pnpm test:coverage` (100% thresholds on lib/engine)
- `pnpm lint`, `pnpm format`

## Conventions

- TypeScript strict; no `any`; prefer `readonly`/immutable data; engine functions return new state.
- Tests first for engine behaviour; keep 100% coverage on `lib/engine`.
- Validate all external/config input with zod; throw clear errors naming the field path.
- Use the `@/` import alias. Prettier formatting; small, well-described commits on feature branches.
- UI strings must be translatable (Arabic RTL + English); avoid left/right in CSS, use logical properties (`ms-`, `ps-`, `text-start`).
