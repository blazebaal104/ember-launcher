# Play with your Microsoft account on Windows

This gets Ember running on your PC, signed in with your own account, and into a game.

## 1. Install the build tools (once)

Open **PowerShell** and run:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Close PowerShell and open a new one so the new commands are found. Windows 11 already includes
WebView2, which Tauri needs. You don't need to install Java: Ember downloads the right Java for
each Minecraft version itself.

## 2. Start Ember

Unzip `ember-launcher.zip`, open PowerShell in the `ember-launcher` folder, then run:

```powershell
npm install
npm run dev
```

The first start compiles the Rust side and takes a few minutes. Later starts take seconds.

## 3. Set up Microsoft sign-in (once)

Open **Settings** in Ember and follow the five steps there. Short version:

1. At portal.azure.com, under **App registrations**, choose **New registration**. Pick
   **Personal Microsoft accounts only** and leave Redirect URI empty.
2. In the app, open **Authentication**, set **Allow public client flows** to Yes, and press Save.
3. Paste the **Application (client) ID** into Ember and press Save.
4. Press **Sign in with Microsoft** once. Ember copies a code and opens microsoft.com/link; enter
   the code there and approve. The first time, this ends with "not approved yet". That's expected:
   Mojang needs to see your app attempt a sign-in.
5. Fill in Mojang's review form (https://aka.ms/mce-reviewappid) with the client ID and the
   **Directory (tenant) ID**. When the approval email arrives, wait up to 24 hours, then sign in again.

After that Ember stays signed in. It refreshes your session in the background, and your login is
kept in Windows Credential Manager.

## 4. Play

Choose **New instance**, pick a version and **Fabric** (or Vanilla), keep the performance stack
on, and press **Play**. The first launch downloads the game, libraries and Java, so give it a minute.

> NeoForge instances can't be launched yet. Use Fabric or Vanilla for now.
> The in-game menu (Right Shift) is only added once `mods/ember-overlay` has been built.
> Until then, instances simply launch without it.

## 5. Optional: a real installer

```powershell
npm run build
```

The installer ends up in `target\release\bundle\nsis\` (and `msi\`).

## If something goes wrong

| Message | Fix |
|---|---|
| "Public client flows are off" | Step 2: set Allow public client flows to Yes and Save. |
| "Microsoft doesn't know this client ID" | Copy **Application (client) ID**, not the object ID or tenant ID. |
| "doesn't accept personal Microsoft accounts" | Create the app again with *Personal Microsoft accounts only*. |
| "Mojang hasn't approved this Azure app" | Submit the form in step 5 and wait for the email (plus up to 24 h). |
| "account has no Xbox profile" | Sign in once at xbox.com or minecraft.net, then retry. |
| "does not own Minecraft: Java Edition" | That account doesn't have the game, or Game Pass hasn't been used in the official launcher yet. |
