# Golden determinism tests

Cross-commit determinism tests for `runMatchToReplay()`.

## Workflow

1) Generate fixtures:

```sh
pnpm golden:update
```

2) Validate fixtures (strict):

```sh
pnpm golden:check
```

`pnpm golden:check` fails if:
- any required fixture file is missing, or
- any fixture still contains placeholders / invalid hashes.

3) Run the golden tests:

```sh
pnpm test:golden
```

Notes:
- Fixtures store hashes (plus per-tick hash arrays) rather than full replay JSON, to keep diffs small.
