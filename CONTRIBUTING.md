# Contributing

Thanks for helping.

## Changing the algorithm

The selection rules are the product. `tests/parity.test.ts` pins the editorial preset to the behaviour of the selector it was extracted from (Artsnet's home page); a change that breaks it needs a new `version` story in the README, because every live shelf would reshuffle. Add new behaviour as options that default to the current behaviour, or as new presets.

## Examples

Every file in `examples/` is imported by `tests/examples.test.ts` and run by `npm run examples` in CI. A new example needs an exported `run()` and a `isMain` guard so it prints only when run directly, plus a row in `examples/README.md`.

## Checks

```bash
npm install
npm run typecheck
npm test
npm run build
npm run examples
```

CI runs the same on Node 20, 22 and 24, then packs the tarball and runs the CLI from it through npx.

## Ground rules

- No runtime dependencies. The core must keep running in Cloudflare Workers and browsers (no Node-only APIs outside `src/cli.ts`).
- Never read a clock or a time zone inside the library; the caller passes the date.
- Determinism is a feature: any new tie-break goes through `hash()` with all its inputs named.
- Commit messages: a short imperative summary line, optionally followed by why.
