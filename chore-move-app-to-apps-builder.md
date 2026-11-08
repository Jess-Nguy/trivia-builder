## Context

Step 2 of the trivia monorepo (PLAN.md Phase 14). PR #21 added `tools/` as npm workspaces and left the app at the root. This moves the app into `apps/builder/` so the repo reads as apps plus tools. The app works the same, and every root command (`npm run dev`, `party`, `build`, `start`, `test`, `harvest`) keeps its name.

```
apps/builder/        the app: server/, client/, test/   (@trivia/builder)
apps/builder/client/ the Vue client                     (trivia-builder-client)
tools/harvester/     the question harvester             (@trivia/harvester)
data/  import/       shared at the root
```

The commits are split for review:
1. `cb95be6`: renames only (43 files, 0 lines changed). Check it with `git show -M --stat cb95be6`. **This commit alone doesn't pass tests**, because the paths are fixed in the next one.
2. `a698bfe`: the path fixes, 14 files.
3. `1de39cc`: docs.

## Road not taken

- **Moving `data/` and `import/` into `apps/builder/`.** The harvester and any future tool read and write them, so they stay at the root. `IMPORT_DIR` and `DATA_DIR` point three levels up from `apps/builder/server/`.
- **Root scripts that call `npm -w @trivia/builder run dev`, which then calls the client.** Two levels of `npm run` mangle extra flags: `npm run dev -- --port 5199` reached vite as `vite 5199`. Root scripts call the client workspace directly, one level deep as before.
- **Rewriting file paths in PLAN.md Phases 0 to 13.** Those are the build history. One note at the top says their `server/`, `client/` and `test/` paths are now under `apps/builder/`.
- **Keeping `client/package-lock.json`.** With the client as a workspace, the root lockfile covers it, and a second lockfile would drift.

## Known worst case to check

- **Re-run `npm install` after pulling.** The client's packages now install at the root `node_modules`. An old `client/node_modules` isn't used, and `npm --prefix client install` is no longer a step.
- **Dependency patch updates.** The root lockfile resolved vue 3.5.35 → 3.5.45 and vite 6.4.3 → 6.4.5. `@vitejs/plugin-vue` 5.2.4 and `qrcode` 1.5.4 are unchanged. All are within the existing caret ranges, and the build and smoke tests below ran on them.
- **Not looked at in a browser.** The servers were checked over HTTP (pages and API return 200). The screens weren't opened.

## Manual testing

1. `npm install` at the root.
2. `npm run dev` and open http://localhost:5173: Game Mode lists the CSVs from `import/`, and the Builder shows the bank from `data/`.
3. `npm run party`: the terminal shows a `Network:` address, and a phone can open `/play`.
4. `npm run build && npm start` and open http://localhost:3001: the same app, served from `apps/builder/client/dist`.
5. `npm run harvest -- wikidata --dry-run`: it reports the same 9 duplicates as before the move, so it still reads the root bank and `import/`.

## Automated testing

`npm test` passes all 131 tests, the same as before. No tests were added, because the PR doesn't change behaviour. The app's own suite also runs alone with `npm -w @trivia/builder test` (87 tests).

Also checked:
- **Fresh clone:** `git clone`, `npm install`, `npm test` (131 pass), `npm run build`, and `npm run harvest -- --help`, all in an empty folder.
- **Real paths:** `IMPORT_DIR` resolves to `<repo>/import` (6 CSVs) and `DATA_DIR` to `<repo>/data` (318 questions).
- **Servers:** a script started `npm run dev`, `npm run party` and `npm start` one at a time and requested `/`, `/play` and the API on each. All returned 200, `party` listened on the network, and the script then stopped each server.

## Where this is documented

- **The repo layout and setup:** the root README, at the top and in *Run it*, *Tests* and *Production*.
- **What moved and why:** PLAN.md Phase 14 step 2, this description, and the commit bodies.
- **The layout as a tech-stack decision:** SCOPE §2, *Repo layout*.

## Interoperability and impact

- **Workspaces:** `apps/builder`, `apps/builder/client` and `tools/*`.
- **The harvester:** depends on `@trivia/builder` and imports `@trivia/builder/server/...` instead of `../../../server/...`.
- **`.gitignore`:** the client's `node_modules`, `dist` and `.vite` paths now point under `apps/builder/client/`.
- **`.claude/launch.json`:** unchanged. It runs `npm run dev`, which still works from the root.
- **Open branches:** `git rebase main` follows the renames, but any new file under `server/`, `client/` or `test/` has to be moved by hand.

## Deployment

None. This is a local app; pull, run `npm install`, and restart.

## `/personal-pragmatic-review`

**Verdict:** ✅ Clean.

Good:
- Commits are split so the move reviews as pure renames.
- The only new comment, in `apps/builder/server/csv.js`, says where `import/` and `data/` live, which the three `'..'` can't say on their own.
- Docs were updated in the same branch.

Non-blocking:
- Commit `cb95be6` doesn't pass tests on its own, so `git bisect` should skip it. That's the trade for a rename-only commit, and it's called out above.
- `.gitignore`: `apps/builder/client/node_modules/` repeats what the existing unanchored `node_modules/` rule already covers. I kept it to match how the file listed the client before.

## `/security-review`

No vulnerabilities at confidence 8/10 or higher.

Checked and found sound:
- **Static files:** Express still serves only `apps/builder/client/dist`. `index.js` resolves it relative to itself and moved unchanged.
- **Path guards:** `resolveImportPath` still rejects paths that leave `IMPORT_DIR`. `IMPORT_DIR` and `DATA_DIR` resolve to the same root folders as before.
- **API guard:** the loopback check in `apiHandler.js` moved byte-for-byte.
- **Lockfile:** every resolved package comes from `registry.npmjs.org`. The changes are the patch updates listed above.
- **`@trivia/builder` name:** marked `private` and linked locally (`"link": true` in the lockfile), so npm never fetches it from the registry during a workspace install.
- **Vite dev server:** it can already only serve files under the repo root, because the root had `workspaces` before this PR.
- **Nothing that shouldn't be committed:** no `node_modules`, `dist`, `.env` or cache files are tracked.

Optional hardening, below the threshold: claim the `@trivia` scope on npm, or use a scope you own, in case someone ever runs `npm install` inside a single package outside the workspace.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
