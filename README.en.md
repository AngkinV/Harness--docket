# Harness- docket

A DeepSeek Harness companion and session-intro plugin: draggable characters, VRM/GLB models, FBX motions, expressions, stickers, a video library, and main-session feedback.

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

The built-in character works immediately. Click to interact; right-click or use `···` to open the menu. Upload your own videos in Library and your own VRM/GLB models or Mixamo-compatible FBX motions in Character. Version 0.9.2 includes four intro videos at their source quality; the external-motion library starts empty. Private models and FBX samples are excluded. The 4K/60fps Light Color clip is included at the maintainer's explicit direction; its original author and independent license are unverified, and it is not covered by the code's BSD license. See NOTICE.md. Use the Harness main composer for questions and tasks; the character follows the current session state. Optional playback-notice speech is configured in Character management and is off by default.

## Develop and release

Use Node.js 24 for development:

```sh
npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund
npm run build
npm run typecheck
npm run check:public
npm pack --ignore-scripts
```

Maintainers should enable the local publication guard with `git config core.hooksPath .githooks` after cloning.

Commit rebuilt `lib/` alongside source changes. Follow [the release rules](docs/public-release.md) and [resource budgets](docs/resource-budget.md). Never upload personal profiles, test results, credentials, or private Git history. Do not add installation lifecycle scripts.

Code: [BSD-3-Clause](LICENSE). See [NOTICE.md](NOTICE.md) for attribution. The optional transparent character comes from [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet); its animation assets are noncommercial and require attribution, separately from the code license.

0.9.2: With autoplay enabled, startup playback begins before the host loading UI. Uploads reuse their streaming checksum; thumbnails release decoders after capture. Blue Maid is the default, with a CC0 RobotExpressive companion included. The old procedural character has been removed. The three-button menu uses one continuous 1.18-second retrieval gesture.
