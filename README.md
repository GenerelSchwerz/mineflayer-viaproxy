# mineflayer-viaproxy

[![NPM version](https://img.shields.io/npm/v/mineflayer-viaproxy.svg)](http://npmjs.com/package/mineflayer-viaproxy)
[![Ko-fi](https://img.shields.io/badge/support-Ko--fi-ff5e5b?logo=kofi\&logoColor=white)](https://ko-fi.com/Generel)
[![Discord](https://img.shields.io/badge/community-Discord-5865F2?logo=discord\&logoColor=white)](https://discord.gg/GaAkvq84Zh)

A **Mineflayer plugin for connecting bots to Minecraft versions not yet supported by Mineflayer**, by routing traffic through a ViaProxy/ViaVersion layer.

If you’ve ever been blocked by version mismatches—this is the workaround.

---

## 🚀 Why you would use this

Mineflayer only supports specific Minecraft protocol versions. When Mojang releases a new update, there’s usually a delay before Mineflayer catches up.

This plugin removes that limitation by placing a translation layer between your bot and the server:

```
Mineflayer bot → ViaProxy → ViaVersion → Server
```

### Without this plugin

* Your bot can only join versions Mineflayer explicitly supports

### With this plugin

* Your bot can connect to **newer (and older) versions immediately**, without waiting for updates

---

## ✅ What you get

* **Connect to newer Minecraft versions**

  * Works even when Mineflayer hasn’t updated yet
  * ViaVersion handles protocol translation behind the scenes

* **Cross-version compatibility**

  * Use one bot across multiple server versions

* **(Limited) Bedrock support**

  * Via ViaProxy + ViaBedrock
  * Works for basic connectivity and some gameplay
  * ⚠️ Not feature-complete or fully stable

* **Automatic proxy management**

  * Downloads and runs ViaProxy automatically
  * Handles ports and lifecycle for you

* **Minimal code changes**

  * Drop-in replacement for `mineflayer.createBot`

---

## 🤔 When to use this

Use this if:

* You want to connect to the **latest Minecraft version right now**
* You need your bot to work across **multiple versions**
* You don’t want to wait for Mineflayer updates
* You’re experimenting with **Java ↔ Bedrock bridging**

Avoid this if:

* You need **perfect protocol accuracy**
* You depend on **low-level packet behavior**
* You’re already on a fully supported version and don’t need translation

---

## 📦 Installation

```bash
npm install mineflayer-viaproxy
```

---

## ⚙️ Usage

### Basic usage

The only real difference: bot creation is now **async**.

```js
const { createBot } = require('mineflayer-viaproxy')

const bot = await createBot({
  host: 'example.com',
  username: 'your_account_email_or_username'
})
```

---

### ⚠️ Important differences from Mineflayer

* `createBot` is **async**

  * It must start and configure ViaProxy before connecting

* `username must match the actual account`

  * ViaProxy authenticates using real credentials
  * Incorrect values will fail authentication

---

### Advanced usage

```js
const { createBot } = require('mineflayer-viaproxy')

const bot = await createBot({
  host: 'example.com',
  username: 'your_account',

  // ViaProxy options
  forceViaProxy: true,
  autoUpdate: true,
  localPort: 25570
})
```

---

## 🧠 How it works

Normally:

```
Mineflayer → Server
```

With this plugin:

```
Mineflayer → ViaProxy (local) → Protocol translation → Server
```

This enables:

* Version bridging (new ↔ old)
* Packet translation
* Cross-edition support (via ViaBedrock)

---

## ⚠️ Limitations

* Not all packets translate perfectly
* Some mechanics behave differently across versions
* Bedrock support is:

  * Experimental
  * Limited by ViaBedrock
* Slight latency overhead due to proxy layer

---

## 🛠 Debugging

This package uses the `debug` library for logging. To enable debug output, set the `DEBUG` environment variable to include `mineflayer-viaproxy`.

**Examples:**

Enable all logs:

```bash
# macOS/Linux
DEBUG=mineflayer-viaproxy:* node your-script.js

# Windows (PowerShell)
$env:DEBUG="mineflayer-viaproxy:*"; node your-script.js
```

Enable specific module:

```bash
DEBUG=mineflayer-viaproxy:openAuthMod node your-script.js
```

---

## 🔥 Why this exists

Mineflayer version support will always lag behind Mojang releases.

This plugin exists so you don’t have to wait.

```