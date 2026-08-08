# AgentSim

## Modular design

- **One responsibility per module.** A file/module should do one thing. If you can't describe it in a sentence without "and", split it.
- **Separate layers.** Keep concerns apart: core logic (domain/simulation), I/O (APIs, files, DB), and interface (CLI/UI). Core logic must not import I/O or interface code.
- **Depend on interfaces, not implementations.** Pass dependencies in (constructor/args) rather than importing globals or singletons. This keeps modules testable and swappable.
- **Small, explicit public surface.** Export only what callers need. Keep helpers private to the module.
- **No circular imports.** If two modules need each other, extract the shared piece into a third module.
- **Config over hardcoding.** Read tunable values (model names, paths, limits) from config or env, never inline.

## Scaffolding

Suggested layout (adapt to the language once chosen):

```
src/            # application code
  core/         # domain / simulation logic (pure, no side effects)
  agents/       # agent definitions and behaviors
  io/           # external calls: LLM clients, storage, network
  config/       # env loading + typed settings (single source of truth)
  cli/ or ui/   # entry points / interface
tests/          # mirrors src/ structure
scripts/        # dev/ops one-offs
```

- **Mirror `src/` in `tests/`** so every module has an obvious test home.
- **Thin entry points.** `main`/CLI wires modules together and does little else.
- **Stable import paths.** Reference modules by package path, not deep relative `../../..` chains where avoidable.
