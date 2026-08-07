# Packaging and updates

## Build an installer

Run from PowerShell:

```powershell
.\packaging\build-release.ps1 -Version 1.0.0 -ReleaseNotes "First packaged release."
```

The installer and `update.json` are written to the Codex `outputs\release` folder. The installer bundles Node.js and all dependencies; customers do not install Node or run setup scripts themselves.

## Publish an update

From a clean GitHub checkout with `gh` signed in:

```powershell
.\packaging\publish-update.ps1 -Version 1.0.1 -ReleaseNotes "Describe the changes here."
```

The script updates the app version, builds the installer, commits the fixed update manifest, pushes it, and creates the matching GitHub Release. Installed apps check that manifest and show a **Download update** button.

Use the same installer identity for every release. Program files are upgraded in place; customer data and `.env` remain under `%ProgramData%\Lockwood IT Services\CashSaver Weekly Ad Builder`.
