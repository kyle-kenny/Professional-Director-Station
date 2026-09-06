# Windows Support Contract

Windows is a first-class target for Professional Director Station.

## Supported baseline

- Windows 11 x64
- Microsoft Edge (current stable) and Google Chrome (current stable)
- WebGL2-capable GPU/driver
- Node.js 22+ for source/dev builds

The current Gate 0 application is browser-hosted, so Windows users can run it without a DCC dependency. `start-windows.cmd` provides a double-click development launcher.

## CI gate

GitHub Actions executes static contracts, Windows compatibility scanning, unit tests, and production build on both `ubuntu-latest` and `windows-latest`. Windows failures block acceptance.

## Rules

- No hard-coded POSIX home/temp paths in runtime source.
- No shell-only chmod/bash dependency for core startup.
- Project and asset URIs remain logical/relative; never persist machine-specific drive roots as canonical asset identity.
- Pointer/mouse/keyboard interaction must work without macOS-only modifier assumptions.
- WebGL resources must be explicitly disposed because long blocking sessions are expected.

## Desktop packaging gate (later phase)

When the desktop shell is added, Windows acceptance expands to installer/uninstaller, file associations, code signing, crash recovery, audio devices, tablet input, multiple GPUs, HiDPI/multi-monitor, long paths, non-ASCII project paths, and offline project reopen.
