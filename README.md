# Antigravity Quota Watcher

Live Antigravity/Gemini quota monitoring directly in VS Code.

This VS Code extension provides a convenient way to monitor your Antigravity/Gemini API quota without leaving your editor. It adds a new view to your activity bar that displays your current quota usage for different models and shows a summary in the status bar.

## Features

- **Real-time Quota Monitoring:** Keep an eye on your token and request limits for various Gemini models.
- **Activity Bar View:** A dedicated tree view shows a detailed breakdown of your quota.
- **Status Bar Integration:** See a summary of your most-used model's quota right in your status bar.
- **Automatic Refresh:** Quota data is periodically refreshed automatically.
- **Secure Authentication:** Securely signs in to your account to fetch quota data.

## Installation

### Method 1: Download Release
1. Download the extension from: [Paste Link Here]
2. Open your terminal and run the following command to install it:
   ```bash
   antigravity --install-extension antigravity-quota-watcher-0.1.0.vsix
   ```

### Method 2: Build from Source
1. Clone this repository and navigate into the repository directory.
2. Run the following commands to package and install the extension:
   ```bash
   npm install -g @vscode/vsce
   vsce package --allow-missing-repository
   antigravity --install-extension antigravity-quota-watcher-0.1.0.vsix
   ```

## Getting Started

1.  **Sign In:** After installation, you will be prompted to sign in. Run the **`Antigravity Quota: Sign In`** command from the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
2.  **View Quota:** Once signed in, the Antigravity Quota view will populate with your current quota information.

Here is where you can see this extension in action:

![Antigravity Quota Watcher](./Screenshot%20from%202026-02-24%2014-21-26.png)

## Commands

The following commands are available in the Command Palette:

-   `Antigravity Quota: Sign In`: Sign in to your Antigravity account.
-   `Antigravity Quota: Sign Out`: Sign out of your Antigravity account.
-   `Antigravity Quota: Refresh`: Manually refresh the quota information.

## Configuration

You can configure the polling interval for refreshing the quota data:

-   `antigravityQuota.pollIntervalSeconds`: How often to refresh quota data (in seconds). The default is 30 seconds.

To change this setting, go to **File > Preferences > Settings** and search for "Antigravity Quota".

---
_This extension is not officially affiliated with Google or Antigravity._
