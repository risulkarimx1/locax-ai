# Repository Guidelines

## Project Structure & Module Organization
Locax combines a Vite/React renderer with an Electron shell. Keep UI code in `src/` (`components`, `pages`, `hooks`, `lib`, `types`). Styling relies on Tailwind (`tailwind.config.ts`) and the base rules in `index.css`. `electron/main.cjs` handles the desktop lifecycle, `public/` stores static assets, `docs/` keeps specs or sample localization files, and patched dependencies stay in `vendor/` per the `package.json` overrides. Treat `dist/` as disposable build output.

## Build, Test, and Development Commands
- `npm run dev` – Launch the Vite dev server (port 5173) for browser work.
- `npm run dev:desktop` – Start Vite and Electron together for desktop debugging.
- `npm run build` – Produce the optimized renderer bundle in `dist/`.
- `npm run desktop` – Build then launch Electron against the production bundle for smoke tests.
- `npm run lint` – Run ESLint via `eslint.config.js`; append `--fix` before committing.
- `npm run dist:{mac|win|linux}` – Package installers with `electron-builder`.

## Coding Style & Naming Conventions
Use TypeScript with 2-space indentation. Components and providers use PascalCase filenames, hooks use camelCase with a `use` prefix, and related files should live in the same feature folder to keep imports local. Favor Tailwind utilities plus the `cn` helper; extend CSS only when a utility is missing. ESLint and TypeScript are the source of truth—resolve warnings instead of suppressing them.

## Testing Guidelines
Automated tests are not yet wired into the scripts, but new work should add Vitest + React Testing Library coverage under `src/**/__tests__`. Name files after the feature (for example, `language-panel.test.tsx`) and aim for roughly 80% statement coverage on touched modules. Until a `test` script exists, record the manual QA steps you ran (`npm run dev`, `npm run dev:desktop`, scenarios exercised) inside the PR description and keep reusable fixtures in `docs/`.

## Commit & Pull Request Guidelines
Follow the imperative, sub-72-character commit style visible in `git log` (`add data viewer`, `scroll implemented`). PRs should include a concise summary, linked issue, screenshots or GIFs for UI changes, and a checklist of commands executed (lint/build/desktop). Call out what was tested or skipped, and keep PRs scoped to a single feature or fix.

## Security & Configuration Tips
Never commit API keys or local AI endpoints; manage secrets via OS keychains or a gitignored `.env.local`. Anything added to `vendor/` is shipped verbatim with the desktop build, so audit and document third-party changes before merging.
