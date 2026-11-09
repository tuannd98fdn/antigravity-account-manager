# ⚡ Antigravity Fleet Pro

**Autonomous Multi-Account Quota Switcher & Continuous Agent Auto-Resume for Antigravity IDE.**

Developed by **Tuan Nguyen Dinh (Bravee06)** • [GitHub](https://github.com/tuannd98fdn/antigravity-account-manager)

---

## 🌟 What is Antigravity Fleet Pro?

When working on demanding software engineering tasks with **Google Antigravity IDE**, agent models like **Claude 3.5 Sonnet** and **Gemini 1.5 Pro** frequently hit hourly or daily quota limits, halting your agent in the middle of crucial tasks.

Most developers resort to third-party proxy pools (like 9Router or Cockpit), which route traffic through unverified middleman servers and risk account suspension from Google.

**Antigravity Fleet Pro** provides a **100% Native, Safe & Autonomous** solution:
1. **Zero-Click Auto Switching:** When quota runs out on Account A, the system detects exhaustion within 20s and instantly hops to Account B with available quota — **no clicks or popup confirmations needed**.
2. **Auto-Resume Agent Tasks:** After switching, Fleet Pro automatically injects an intelligent resume prompt into the active Antigravity session. The agent picks up right from where it left off, reading the local transcript and finishing the task smoothly.
3. **Native Direct Integration:** No middleman APIs, no proxies. All communications stay strictly between Antigravity IDE and Google's official endpoints (`cloudcode-pa.googleapis.com` & `oauth2.googleapis.com`). Tokens stay encrypted in your local OS Keychain.

---

## 🚀 Key Features

| Feature | Description |
| :--- | :--- |
| **Autonomous Quota Hop** | Detects model exhaustion and switches to the next account with verified quota automatically. |
| **Agent Auto-Resume** | Injects follow-up context into the Antigravity conversation so coding continues without manual re-prompting. |
| **Live Quota Radar** | Real-time breakdown of available quota percentages and exact countdowns to reset. |
| **Chrome Profile Importer** | One-click import for all Google accounts stored across your Chrome browser profiles. |
| **Native State Synchronization** | Directly synchronizes session tokens and UserStatus in Antigravity's internal State Sync engine. |
| **Zero External Telemetry** | 100% local. Your tokens and credentials never leave your machine. |

---

## 📦 Quick Installation

### Method 1: Install Pre-built VSIX (Recommended)
1. Download the latest `antigravity-account-manager-1.0.0.vsix` from [Releases](https://github.com/tuannd98fdn/antigravity-account-manager/releases).
2. Open **Antigravity IDE**.
3. Press `Cmd + Shift + P` (Mac) or `Ctrl + Shift + P` (Windows/Linux) and select:
   ```text
   Extensions: Install from VSIX...
   ```
4. Choose the downloaded `.vsix` file and reload the window.

### Method 2: Build from Source
```bash
git clone https://github.com/tuannd98fdn/antigravity-account-manager.git
cd antigravity-account-manager
npm ci
npm test
npm run package
```

---

## 🛠️ Usage Guide

1. Click on the **Antigravity Fleet** icon in your IDE Activity Bar (left sidebar).
2. Click **Use IDE Session** to save your current signed-in Google account.
3. Click **Connect Google** to add your secondary/backup Google accounts.
4. Under **Autonomous Quota Hop**:
   - Select your target model (e.g. *Claude 3.5 Sonnet* or *Gemini 1.5 Pro*).
   - Check **Enable Quota Monitoring**.
   - Check **Zero-Click Auto Switch** (enabled by default).
   - Check **Auto-Resume Task** (enabled by default).
5. Sit back and let your Antigravity Agent work continuously overnight!

---

## 🛡️ Privacy & Security

- **OS-Level Keyring Encryption:** Tokens are stored directly inside VS Code's encrypted `SecretStorage` (macOS Keychain, Windows Credential Manager, Linux Secret Service).
- **Direct Google API:** No intermediary server. Requests strictly connect to Google's official OAuth & Cloud Code APIs.
- **Chrome Safety:** The Chrome import utility only reads email strings from local profile configuration hints to pre-fill login hints. It never touches cookies, passwords, or browsing data.

---

## 📄 License

Licensed under the [Apache License 2.0](LICENSE).  
Copyright (c) 2026 Tuan Nguyen Dinh (Bravee06).
