# mineflayer-viaproxy

[![NPM version](https://img.shields.io/npm/v/mineflayer-viaproxy.svg)](http://npmjs.com/package/mineflayer-viaproxy)

A mineflayer plugin that allows you to connect to a server through a ViaVersion proxy.

Why? Because I'm tired of people asking for version updates.

If you have issues, join [here](https://discord.gg/g3w4G88y) for support.
Alternatively, [here](https://discord.gg/prismarinejs-413438066984747026) for general mineflayer support.


### Prerequisites
* Node.js v16 or higher
* Java Runtime Environment (JRE) installed and accessible via command line, preferably version 17 or higher.

### TODOS

* [x] Support bedrock versions
* [x] Support adding accounts to ViaProxy gracefully.
* [x] Make fix for prismarine-registry more robust (see patches)
* [ ] Add support for more ViaVersion options
* [x] Add support for more ViaProxy options
* [x] Support Python

## Installation

```bash
npm install mineflayer-viaproxy
```

## Usage

```js
const { createBot } = require('mineflayer-viaproxy')

// only difference is that this must be awaited now.
const bot = await createBot({...})

// if you want to pass viaProxy options, it'd be like so:

const orgBotOpts = {...}
const viaProxyOpts = {...}

// same object. 
const bot = await createBot({...orgBotOpts, ...viaProxyOpts});
```

More examples can be found in the `examples/` folder.

## API

### Types

#### `AuthType`

```ts
export enum AuthType {
    NONE = "NONE",
    OPENAUTHMOD = "OPENAUTHMOD",
    ACCOUNT = "ACCOUNT",
}
```

| Name          | Value           | Description                                    |
| ------------- | --------------- | ---------------------------------------------- |
| `NONE`        | `"NONE"`        | No authentication                              |
| `OPENAUTHMOD` | `"OPENAUTHMOD"` | OpenAuthMod authentication                     |
| `ACCOUNT`     | `"ACCOUNT"`     | Account authentication (requires manual setup) |

#### `ViaProxyOpts`

```ts
export interface ViaProxyOpts {
    forceViaProxy?: boolean;
    javaPath?: string;
    localPort?: number;
    localAuth?: AuthType;
    viaProxyLocation?: string;
    viaProxyWorkingDir?: string;
    autoUpdate?: boolean;
    viaProxyConfig?: Partial<ViaProxyConfig>;
    viaProxyStdoutCb?: (data: any) => void;
    viaProxyStderrCb?: (data: any) => void;
}
```

| Name                 | Type                      | Default           | Description                                                                                                                           |
| -------------------- | ------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `forceViaProxy`      | boolean                   | false             | Whether or not to force the use of ViaProxy. If set to true, it will always use ViaProxy regardless of the server version.            |
| `javaPath`           | string                    | `"java"`          | The path to the java executable.                                                                                                      |
| `localPort`          | number                    | *auto determined* | The port to listen on for the local server. If none is specified, it will automatically locate an open port for you on your computer. |
| `localAuth`          | `AuthType`                | `AuthType.NONE`   | The authentication type to use for the local server.                                                                                  |
| `viaProxyLocation`   | string                    | ""                | The location of the ViaVersion proxy jar. If none specified, it will download automatically to the CWD + `viaproxy`.                  |
| `viaProxyWorkingDir` | string                    | ""                | The working directory for the ViaVersion proxy. If none specified, it will use the CWD + `viaproxy`.                                  |
| `autoUpdate`         | boolean                   | true              | Whether or not to automatically update the ViaVersion proxy.                                                                          |
| `viaProxyConfig`     | `Partial<ViaProxyConfig>` | undefined         | Configuration options for ViaProxy.                                                                                                   |
| `viaProxyStdoutCb`   | `(data: any) => void`     | undefined         | A callback for the stdout of the ViaVersion proxy.                                                                                    |
| `viaProxyStderrCb`   | `(data: any) => void`     | undefined         | A callback for the stderr of the ViaVersion proxy.                                                                                    |

#### `ViaProxyConfig`

```ts
export interface ViaProxyConfig {
    backendProxyUrl: string;
    [key: string]: string | number | boolean;
}
```

| Name              | Type    | Description                                                                         |          |                                                |
| ----------------- | ------- | ----------------------------------------------------------------------------------- | -------- | ---------------------------------------------- |
| `backendProxyUrl` | string  | The URL of the backend proxy to connect to. If none specified, it will not use one. |          |                                                |
| `[key: string]`   | `string \| number \| boolean` | Additional configuration options for ViaProxy. |

