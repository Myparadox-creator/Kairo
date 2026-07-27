# Contributing to Kairo

Thanks for taking the time to contribute.

## Before You Start

- Read the README and architecture overview first.
- Prefer small, focused changes.
- Do not edit generated `dist-chrome/` or `dist-firefox/` files directly; change the source files and rebuild instead.

## 🚨 ELUSOC & Open Source Program Rules (Strict Admin Policy)

I have a **Zero-Tolerance Policy** for metric farming and contribution fraud. As the project admin, I strictly enforce the following rules:

1. **No Bot/Automated Submissions**: Creating issues and PRs at machine speed (e.g., 20 PRs in 30 seconds) will result in an instant ban.
2. **No Stacked Branch Inflation**: PRs must be created cleanly from the `main` branch. Creating PRs from previous feature branches to artificially inflate GitHub line counts is strictly prohibited. Your level is judged on the _incremental_ code changed, not the inflated diff.
3. **No Artificial Splitting**: Do not split a single logical feature or issue into multiple trivial PRs just to farm points.
4. **No Self-Serve Point Farming**: Do not create generic issues just to immediately open a pre-written PR against them.
5. **Relevant Code Only**: Do not inject irrelevant code, tools, or languages (e.g., Python scripts in a JavaScript extension) just to generate a diff.
6. **Level Assignments are Final**: The admin will manually downgrade or remove labels for trivial changes (e.g., 1-line changes, CSS alignment, empty diffs).

**Violating any of these rules will result in the immediate stripping of all ELUSOC points and a permanent ban.**

## Local Setup

```bash
npm install
npm run dev
```

For Firefox builds, use `npm run dev:firefox` or `npm run build:firefox`.

## Code Style

- Keep modules small and readable.
- Use clear, descriptive names.
- Preserve the current message and storage boundaries between `content/`, `background/`, and `shared/`.
- Add comments only when they explain non-obvious behavior.
- Keep user-facing text plain and professional.

## Testing

Before opening a pull request, run at least:

```bash
npm run build
```

If you touch Firefox-specific code, also run:

```bash
npm run build:firefox
```

## Pull Request Checklist

- Explain what changed and why.
- Include screenshots or short recordings for UI changes when possible.
- Mention any manual verification steps.
- Keep the diff focused on one topic.

## Issue Reports

When filing an issue, include:

- Browser and version
- Extension target platform
- Steps to reproduce
- Expected behavior
- Actual behavior
