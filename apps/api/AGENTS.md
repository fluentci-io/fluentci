# Gleam and JavaScript bindings

- Keep every `.mjs` file formatted with Prettier, including FFI bindings, entry points, scripts, tests, and generated code.
- Run `bun run format` after editing bindings and `bun run lint` before finishing.
- Generators must emit formatted JavaScript so regeneration preserves formatting checks.
- Define application queries and table schemas in Gleam. Import Drizzle functions directly, without an `orm.` namespace at call sites.
