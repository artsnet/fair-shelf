# Examples

Each file is a complete, runnable scenario. Run one with `npm run example examples/<file>` (or `npx tsx examples/<file>`); `npm run examples` runs them all. The test suite imports every example too, so they cannot rot.

| File | Scenario | What it shows |
|---|---|---|
| `01-blog-homepage.ts` | A blog's daily "three posts" | The editorial preset without lanes; what exposure facts look like |
| `02-shop-showcase.ts` | A shop's featured row | Custom slots (new arrival, underexposed, seasonal), category lanes, a structured audience |
| `03-community-gallery.ts` | A gallery featuring four works a day | Computing exposure from a showings log and writing picks back; the plain rotation preset |
| `04-multilingual-catalogue.ts` | A bilingual catalogue (Artsnet's own setup) | Language lanes, one audience per visitor language, day-by-day rotation |
| `05-simulate-fairness.ts` | Checking a configuration before shipping | The simulator and its fairness report |
| `06-reserved-and-thin-pools.ts` | Hand-picked features and small pools | `reserved` positions and the `relaxation` level on each pick |

The examples import `@artsnet/fair-shelf`; inside this repository that resolves to `src/` through the TypeScript path mapping, so no build is needed. Copy a file into your project, install the package, and it runs as is.
