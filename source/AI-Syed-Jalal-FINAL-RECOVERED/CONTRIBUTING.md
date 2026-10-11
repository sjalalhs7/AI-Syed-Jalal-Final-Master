# Contributing

## Development flow

1. Create a focused branch.
2. Make the smallest safe change that solves the problem.
3. Update documentation when behavior or operations change.
4. Add or update a regression test for bugs.
5. Run the local quality checks before opening a pull request.
6. Keep secrets, production data, and generated backups out of Git.

## Quality expectations

- Preserve the existing homepage, login flow, branding, Region/Sector workflow, import/export, and document-printing behavior unless a change explicitly targets them.
- Prefer deterministic, testable modules over hidden browser-side state.
- Do not claim live PostgreSQL, provider, printer, or multi-PC validation unless it was actually performed.
- Keep release notes factual and distinguish static validation from live environment validation.

## Pull requests

Describe the user-visible change, affected components, tests run, and any deployment assumptions. For security-sensitive changes, explain the threat addressed and the residual risk.
