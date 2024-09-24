import { Bot, BotOptions, createBot as orgCreateBot } from "mineflayer";
import { ping } from "minecraft-protocol";
import { ping as bdPing } from "bedrock-protocol";
import { supportedVersions } from "minecraft-data";
import { spawn } from "child_process";
import { AuthType, ViaProxyOpts } from "./types";
import { openAuthLogin } from "./openAuthMod";
import {
  configureGeyserConfig,
  fetchViaProxyJar,
  findOpenPort,
  getSupportedMCVersions,
  identifyAccount,
  loadProxySaves,
  openViaProxyGUI,
  verifyGeyserLoc,
  verifyViaProxyLoc,
} from "./utils";
import path from "path";
import { existsSync, mkdir, mkdirSync } from "fs";

import "prismarine-registry";
import { VIA_PROXY_CMD } from "./constants";

const debug = require("debug")("mineflayer-viaproxy");

/**
 * sort for newest version first.
 */
const cmpVersions = (first: string, second: string) => {
  const a = first.split(".").map((x) => parseInt(x));
  const b = second.split(".").map((x) => parseInt(x));

  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i]) return -1;
    if (a[i] < b[i]) return 1;
  }

  return 0;
};

export async function createBot(options: BotOptions & ViaProxyOpts, oCreateBot = orgCreateBot) {
  let ver: string;
  let useViaProxy = false;

  const currentLatestVersion = supportedVersions.pc[supportedVersions.pc.length - 1]; // latest version;
  const bedrock = options.bedrock ?? false;

  if (bedrock) {
    if (options.host == null || options.port == null) throw new Error("Host and port must be provided for bedrock edition.");
    const test = await bdPing({
      host: options.host, // external host
      port: options.port, // external port
    });

    ver = `Bedrock ${test.version}`;//`Bedrock ${test.version}`;
    useViaProxy = true;

  } else {
    const test = await ping({
      host: options.host, // external host
      port: options.port, // external port
    });

    if (test.version instanceof String) {
      ver = test.version as string;
    } else {
      ver = (test.version as { name: string }).name;
    }

    const regex = /1\.\d+(\.\d+)?/g;
    const match = ver.match(regex);

    if (match == null) {
      debug(`Failed to match version from ${ver}!`);
    } else {
      const sorted = match.sort(cmpVersions);
      debug(`Detected versions [${sorted.join(', ')}] from "${ver}".`)
      ver = sorted[0]

      // if any version is greater than current latest version
      let higherVerDetected = false;
      for (const v of sorted) {
        const cmp = cmpVersions(v, currentLatestVersion)
        if (cmp < 0) {
          higherVerDetected = true;
        } else if (cmp === 0) {
          ver = v;
          break;
        } else if (higherVerDetected) {
          // we found a lower version and a higher version, meaning multiple versions are supported.
          // this means we don't need viaProxy.
          debug(`Multi-version detected. Using latest version ${currentLatestVersion}.`)
          ver = currentLatestVersion;
          break;
        }
      }

      useViaProxy = !supportedVersions.pc.includes(ver);
    }
  }


  let bot!: Bot;

  if (useViaProxy) {

    debug(`ViaProxy is needed for version ${ver}. Launching it.`)

    const cleanupProxy = () => {
      if (bot != null && bot.viaProxy != null && !bot.viaProxy.killed) {
        bot.viaProxy.kill("SIGINT");
        delete bot.viaProxy; // this shouldn't be necessary, but why not.
      }
    };

    const wantedCwd = options.viaProxyWorkingDir ?? path.join(process.cwd(), "viaproxy");

    if (!existsSync(wantedCwd)) {
      await mkdirSync(wantedCwd, { recursive: true });
    }
    const javaLoc = options.javaPath ?? "java";
    const location = await verifyViaProxyLoc(wantedCwd, options.autoUpdate, javaLoc, options.viaProxyLocation);

    const rHost = options.host ?? "127.0.0.1";
    const rPort = options.port ?? 25565;
    const port = options.localPort ?? (await findOpenPort());
    const auth = options.localAuth ?? (options.auth !== "offline" || !options.auth) ? AuthType.ACCOUNT : AuthType.NONE; // TODO maybe OPENAUTHMOD if we support by default?

    // perform ViaProxy setup.
    let cmd = VIA_PROXY_CMD(javaLoc, location);
    cmd = cmd + " --target-address " + `${rHost}:${rPort}`;
    cmd = cmd + " --bind-address " + `127.0.0.1:${port}`;
    cmd = cmd + " --auth-method " + auth;
    cmd = cmd + " --proxy-online-mode " + "false";

    if (bedrock) {

          // for now, we'll just assume latest bedrock version.
          const supported = await getSupportedMCVersions(javaLoc, wantedCwd, location)
          const latestBedrock = supported.find((x) => x.includes("Bedrock"));
          if (latestBedrock == null) {
            throw new Error("Failed to find latest Bedrock version.");
          }

          debug(`Latest Bedrock supported by ViaProxy version is ${latestBedrock}. Using it.`)
          cmd = cmd + " --target-version " + `"${latestBedrock}"` // comment to auto detect version
    }

    const newOpts = { ...options };
    // here is where we know we need to initialize ViaProxy.
    newOpts.host = "127.0.0.1";
    newOpts.port = port;
    newOpts.version = currentLatestVersion;

    if (auth !== AuthType.ACCOUNT) newOpts.auth = "offline";
    else {
      newOpts.auth = "offline";
      const idx = await identifyAccount(options.username, bedrock, javaLoc, location, wantedCwd);
      cmd = cmd + " --minecraft-account-index" + ` ${idx}`;
    }

    debug(`Launching ViaProxy with cmd: ${cmd}`);

    const viaProxy = spawn(cmd, { shell: true, cwd: wantedCwd });

    if (options.viaProxyStdoutCb) viaProxy.stdout.on("data", options.viaProxyStdoutCb);

    if (options.viaProxyStderrCb) viaProxy.stderr.on("data", options.viaProxyStderrCb);

    // added for robustness, just to be sure.
    process.on("beforeExit", cleanupProxy);

    await new Promise<void>((resolve, reject) => {
      const stdOutListener = (data: string) => {
        if (data.includes("started successfully")) {
          debug("ViaProxy started successfully");

          viaProxy!.stdout.removeListener("data", stdOutListener);
          viaProxy!.stderr.removeListener("data", stdErrListener);
          setTimeout(() => {
            debug("Creating bot after ViaProxy started.");
            bot = oCreateBot(newOpts);
            bot.on("end", cleanupProxy);
            openAuthLogin(bot).then(resolve);
          }, 1000);
        }

        if (data.includes("main/WARN")) {
          const d = data.toString().split("[main/WARN]")[1].trim();
          debug(d);
        }
      };
      const stdErrListener = (data: any) => {
        viaProxy!.stdout.removeListener("data", stdOutListener);
        viaProxy!.stderr.removeListener("data", stdErrListener);
        cleanupProxy();
        reject(new Error("ViaProxy failed to start"));
      };

      viaProxy!.stdout.on("data", stdOutListener);
      viaProxy!.stderr.on("data", stdErrListener);
    });

    bot.viaProxy = viaProxy;
  } else {
    debug(`For version ${ver}, ViaProxy is not needed. Launching bot normally.`);
    // perform current bot setup.
    bot = oCreateBot(options);
  }

  return bot;
}
