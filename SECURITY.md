# Security policy

Report vulnerabilities privately through GitHub's "Report a vulnerability" form on this repository (Security tab), not in a public issue.

This package has no dependencies, makes no network requests, reads no environment and keeps no state. Its inputs are plain data and callbacks supplied by the caller. The CLI reads one JSON file named on the command line. The main things worth reporting are: unbounded time or memory on crafted input (for example very large `shownDates` arrays), a way for the CLI to read or write a file it was not given, or a determinism break (different results for the same input on different runtimes).
