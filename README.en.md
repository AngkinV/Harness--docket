# Harness- docket

A DeepSeek Harness companion and session-intro plugin: draggable characters, VRM/GLB models, FBX motions, expressions, stickers, a video library, and optional character chat.

## Install

In the Harness plugin manager, add this repository URL:

```text
https://github.com/AngkinV/Harness--docket
```

Or run:

```sh
dsh plugin --profile web add https://github.com/AngkinV/Harness--docket --ignore-scripts
```

Reload as prompted by Harness. Node.js 20+ and Harness 0.1.7-rc.2+ are required. Precompiled files are included; installation needs no build scripts. URL installation does not imply inclusion in the official curated catalog.

The built-in character works immediately. Click to interact; right-click or use `···` to open the menu. Upload your own videos in Library and your own VRM/GLB models or Mixamo-compatible FBX motions in Character. The public edition excludes the developer's models, motion samples, and sample intro videos. Its video and external-motion libraries start empty. Chat requires explicit opt-in and a configured Harness model. Speech is off by default.

## Develop and release

Use Node.js 24 for development:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run typecheck
npm run check:public
npm pack --ignore-scripts
```

Maintainers should enable the local publication guard with `git config core.hooksPath .githooks` after cloning.

Commit rebuilt `lib/` alongside source changes. Follow [the release rules](docs/public-release.md) and [resource budgets](docs/resource-budget.md). Never upload personal profiles, test results, credentials, or private Git history. Do not add installation lifecycle scripts.

Code: [BSD-3-Clause](LICENSE). See [NOTICE.md](NOTICE.md) for attribution. The optional transparent character comes from [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet); its animation assets are noncommercial and require attribution, separately from the code license.
