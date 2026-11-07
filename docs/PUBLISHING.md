# Publishing to GitHub

This repository is already laid out as a public DSH bundle: no runtime
dependencies, no personal database, no generated build output, MIT license,
CI workflow, tests and a release packer.

## 1. Replace repository placeholders

- In `README.md`, replace `https://github.com/redogcc/prompt-ledger.git`
  with your real clone URL (or remove the clone block if you use the GitHub UI).
- In `LICENSE`, replace `Prompt Ledger contributors` if you publish under a
  different legal name.
- The package keeps the local bundle name `@local/prompt-ledger`. That is
  intentional: DSH installs it from a local directory or release zip, not from
  the npm registry.

## 2. Verify

```bash
npm test
npm run check
npm run pack:release
cat dist/prompt-ledger-1.0.0.sha256
```

`dist/` is ignored by git; the zip belongs on the GitHub Releases page, not in
the repository history.

## 3. Create and push

```bash
git init -b main
git add .
git commit -m "feat: prompt ledger 1.0.0"
git remote add origin git@github.com:redogcc/prompt-ledger.git
git push -u origin main
```

Or create the empty repository on GitHub and upload the folder contents through
the web UI (exclude `dist/`).

## 4. Create the first release

With GitHub CLI:

```bash
gh release create v1.0.0 \
  dist/prompt-ledger-1.0.0.zip \
  dist/prompt-ledger-1.0.0.sha256 \
  --title "Prompt Ledger 1.0.0" \
  --notes-file CHANGELOG.md
```

Without GitHub CLI, open **Releases → Draft a new release**, choose `v1.0.0`,
attach both `dist/` files, and paste the `1.0.0` section from `CHANGELOG.md`.

## 5. Post-release checklist

- Confirm the README banner renders on GitHub.
- Confirm the release zip extracts to `prompt-ledger-1.0.0/`.
- Install that extracted directory through DSH `plugin_manager` and refresh.
- Confirm the sidebar entry, composer capsule and one completed-turn footer.
- Never attach `prompt-ledger.sqlite3`, logs, exported conversations or platform
  tokens to a release.
