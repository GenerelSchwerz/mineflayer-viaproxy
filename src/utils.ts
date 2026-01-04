import { appendFileSync, createWriteStream, existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { Bot } from "mineflayer";
import { BASE_VIAPROXY_URL, BASE_GEYSER_URL, VIA_PROXY_CMD } from "./constants";
import { exec } from "child_process";

import jsyaml from "js-yaml";
import { ClientOptions } from "minecraft-protocol";
import path from "path";
import { ViaProxySettings, ViaProxyOpts } from "./types";
import { AccountV3, BedrockAccount, MicrosoftAccount } from "./types/accountsV3";
import { AccountV4, BedrockAccountV4, MicrosoftAccountV4 } from "./types/accountsV4";
import jwt from "jsonwebtoken";
import { ViaProxyV3Config, ViaProxyV4Config } from "./types/config";
import { convToV4 } from "./convNmp";

const debug = require("debug")("mineflayer-viaproxy");



const minecraftFolderPath = require("minecraft-folder-path");

export function validateOptions(options: ClientOptions): ClientOptions & { profilesFolder: string } {
  if (options.profilesFolder == null) {
    options.profilesFolder = path.join(minecraftFolderPath, "nmp-cache");
  }
  return options as any;
}



export async function openAuthLogin(bot: Bot) {
  const listener = (packet: any) => {
    const channel = packet.channel;
    if (channel !== "oam:join") return;

    bot._client.write("login_plugin_response", {
      messageId: packet.messageId,
      data: Buffer.from([1]),
    });
    bot._client.removeListener("login_plugin_request", listener);
  };
  bot._client.removeAllListeners("login_plugin_request"); // remove default handler.
  bot._client.on("login_plugin_request", listener);
}


/**
 * Tries to find an open port to use for the prismarine-viewer server.
 */
export async function findOpenPort(): Promise<number> {
  const net = require("net");
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => {
        resolve(port);
      });
    });
  });
}



function viaProxyAvailable(cwd: string, use8: boolean): string | null {
  // don't match the +java8 part, as it's optional.
  // ViaProxy-3.3.4-SNAPSHOT.jar
  // ViaProxy-3.3.3-RELEASE.jar

  // only allow java8 if use8 is true.
  // do not accept any jars that do NOT have +java8 if use8 is true.
  let regex;
  if (use8) {
    regex = /ViaProxy-\d+\.\d+\.\d+(-SNAPSHOT)?(-RELEASE)?\+java8\.jar/;
  } else {
    regex = /ViaProxy-\d+\.\d+\.\d+(-SNAPSHOT)?(-RELEASE)?\.jar/;
  }

  const valid = [];
  // check directory for file names
  const files = readdirSync(cwd);
  for (const file of files) {
    if (regex.test(file)) valid.push(file);
  }

  if (valid.length === 0) return null;

  // sort the versions and return the latest one.
  valid.sort(isGreaterThan);
  return join(cwd, valid[0]);
}

function extractVersion(viaProxyPath: string): string {
  const filename = viaProxyPath.split("/").pop()!;
  const version = filename.split("-")[1].split(".jar")[0];
  return version;
}


function isGreaterThan(src: string, test: string): number {
  const srcArr = src.split(".").map((x) => parseInt(x));
  const testArr = test.split(".").map((x) => parseInt(x));

  for (let i = 0; i < srcArr.length; i++) {
    if (srcArr[i] > testArr[i]) return 1;
    if (srcArr[i] < testArr[i]) return -1;
  }

  return 0;
}


function geyserAvailable(cwd: string): string | null {
  // don't match the +java8 part, as it's optional.
  const regex = /Geyser-\d+\.\d+\.\d+\.jar/;

  // check directory for file names
  const files = readdirSync(cwd);
  for (const file of files) {
    if (regex.test(file)) return join(cwd, file);
  }
  return null;
}

async function getViaProxyJarVersion(use8 = false): Promise<{ version: string; snapshot: boolean, filename: string }> {
  const req = await fetch(BASE_VIAPROXY_URL);
  const html = await req.text();



  const versions = html.match(/ViaProxy-([0-9.]+)/);
  if (versions == null) {
    throw new Error("Failed to get ViaProxy version.");
  }
  const version = versions[1];
  const snapshot = html.includes('SNAPSHOT');

  // build filename
  let filename = 'ViaProxy-';
  filename += version;
  filename += snapshot ? '-SNAPSHOT' : '-RELEASE';
  filename += use8 ? '+java8' : '';
  filename += '.jar';

  return { version, snapshot, filename };
}


export async function getSupportedMCVersions(javaLoc: string, cwd: string, filename: string, javaArgs: string[]): Promise<string[]> {
  // run the jar file to get the supported versions.
  const test = exec(`${VIA_PROXY_CMD(javaLoc, filename, {cli: true, javaArgs})} --list-versions`, { cwd: cwd });

  let versions: string[] = [];

  // read from stdout

  let seeStartVersions = false;


  await new Promise<void>((resolve, reject) => {
    let stdOutListener = (data: string) => {
      const strData = data.toString();
      if (!strData.includes("===") && !seeStartVersions) return;
      else if (strData.includes("===") && seeStartVersions) {
        test.stdout?.removeListener("data", stdOutListener);
        test.stderr?.removeListener("data", stdErrListener);
        resolve();
        return;
      }

      if (strData.includes("===")) {
        seeStartVersions = true;
        return;
      }

      // \x1B[34m[13:52:06]\x1B[m \x1B[32m[main/INFO]\x1B[m \x1B[36m(ViaProxy)\x1B[m \x1B[0m1.20.2\n\x1B[m
      // get 1.20.2
      const split = strData.split("\x1B[0m")
      const version = split[split.length - 1].split('\n')[0]
      versions.push(version);
      // resolve();
    }

    let stdErrListener = (data: string) => {
      console.error(data.toString());
      test.stdout?.removeListener("data", stdOutListener);
      test.stderr?.removeListener("data", stdErrListener);
      reject();
      return;
    }

    if (test.stdout != null) {
      test.stdout.on("data", stdOutListener);
    }

    if (test.stderr != null) {
      test.stderr.on("data", stdErrListener);
    }
  });
  return versions;
}

async function getGeyserJarVersion(): Promise<{ version: string; filename: string }> {
  // https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/viaproxy
  // to: https://download.geysermc.org/v2/projects/geyser/versions/2.4.2/builds/672/downloads/viaproxy

  const resp = await fetch(`${BASE_GEYSER_URL}/versions/latest/builds/latest`);
  // follow the redirect to get the latest release
  // hardcode-y, but it'll work.

  const version = resp.url.split("versions/")[1].split("/")[0];
  const buildVer = resp.url.split("builds/")[1].split("/")[0];

  const filename = `Geyser-${version}-${buildVer}.jar`;

  return { version: `${version}-${buildVer}`, filename };
}

/**
 * @returns {Promise<string>} the path to the downloaded ViaProxy jar
 */
export async function fetchViaProxyJar(path: string, version: string, filename: string): Promise<string | void> {
  const url = `${BASE_VIAPROXY_URL}/artifact/build/libs/${filename}`;

  const resp2 = await fetch(url);

  if (!resp2.ok) {
    console.error(`Failed to download ViaProxy jar: ${resp2.statusText}`);
    return;
  }

  // const path = join(__dirname, filename)
  const filepath = join(path, filename);
  const fileStream = createWriteStream(filepath);

  const stream = new WritableStream({
    write(chunk) {
      fileStream.write(chunk);
    },
  });

  if (!resp2.body) throw new Error("No body in response");
  await resp2.body.pipeTo(stream);

  return filepath;
}

export async function fetchGeyserJar(pluginDir: string, verAndBuild: string, filename: string): Promise<string | void> {
  // https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/viaproxy

  const [version, build] = verAndBuild.split("-");
  const url = `${BASE_GEYSER_URL}/versions/${version}/builds/${build}/downloads/viaproxy`;

  const resp2 = await fetch(url);

  if (!resp2.ok) {
    console.error(`Failed to download Geyser jar: ${resp2.statusText}`);
    return;
  }

  // const path = join(__dirname, filename)
  const filepath = join(pluginDir, filename);
  const fileStream = createWriteStream(filepath);

  const stream = new WritableStream({
    write(chunk) {
      fileStream.write(chunk);
    },
  });

  if (!resp2.body) throw new Error("No body in response");
  await resp2.body.pipeTo(stream);

  return filepath;
}


// export async function verifyJavaLoc(javaLoc: string): Promise<string> {
//   // implementation: check if javaLoc exists and is executable
//   if (!existsSync(javaLoc)) {
//     throw new Error(`Java executable not found at path: ${javaLoc}. Try setting your javaPath in your options.`);
//   }
//   return javaLoc;
// }
import { spawn } from 'child_process';

export async function verifyJavaLoc(javaLoc: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Attempt to spawn 'java -version' (or whatever path was provided)
    // spawn automatically searches the system PATH if a simple command is given
    const child = spawn(javaLoc, ['-version']);

    // If the binary cannot be found or run, this 'error' event fires (e.g., ENOENT)
    child.on('error', (err) => {
      reject(new Error(`Java executable not found or invalid at: ${javaLoc}. Detail: ${err.message}`));
    });

    // If it closes, it means it ran successfully (even if java -version returns non-zero, it exists)
    child.on('close', () => {
      resolve(javaLoc);
    });
  });
}


export async function verifyViaProxyLoc(cwd: string, autoUpdate = true, javaLoc: string, location?: string): Promise<string> {
  if (!location || !existsSync(location)) {
    const javaVer = await checkJavaVersion(javaLoc);

    if (!autoUpdate) {
      const viaProxy = viaProxyAvailable(cwd, javaVer < 17);
      if (viaProxy) {
        debug("Found ViaProxy jar in directory. Using that.");
        return viaProxy;
      }
    }

    const { version, filename } = await getViaProxyJarVersion(javaVer < 17);

    if (autoUpdate) {
      const testLoc = join(cwd, filename);
      if (existsSync(testLoc)) {
        if (isGreaterThan(extractVersion(testLoc), version) >= 0) {
          debug(`Found version  ${extractVersion(testLoc)} of ViaProxy, which is good enough. Skipping download.`);
          return testLoc;
        } else {
          debug("Found older version of ViaProxy. Deleting.");
          unlinkSync(testLoc);
        }
      } else {
        const available = viaProxyAvailable(cwd, javaVer < 17);
        if (available) {
          if (isGreaterThan(extractVersion(available), version) >= 0) {
            debug(`Found version ${extractVersion(available)} of ViaProxy, which is good enough. Skipping download.`);
            return available
          } else {
            debug(`Found older version of ViaProxy. Deleting and installing newer.`);
            unlinkSync(available);
          }
        }
      }
    }

    debug(`Fetching ViaProxy for java version ${version}.`)
    const jar = await fetchViaProxyJar(cwd, version, filename);
    if (!jar) throw new Error("Failed to fetch ViaProxy jar.");
    return jar;
  }

  // TODO check if jar is valid.
  return location;
}

export async function verifyGeyserLoc(pluginDir: string, autoUpdate = true, location?: string): Promise<string> {
  if (!location || !existsSync(location)) {
    if (!autoUpdate) {
      const geyser = geyserAvailable(pluginDir);
      if (geyser) {
        debug("Found Geyser jar in directory. Using that.");
        return geyser;
      }
    }

    const { version, filename } = await getGeyserJarVersion();

    if (autoUpdate) {
      const testLoc = join(pluginDir, filename);
      if (existsSync(testLoc)) {
        debug("Geyser jar already exists, skipping download.");
        return testLoc;
      } else {
        const available = geyserAvailable(pluginDir);
        if (available) {
          unlinkSync(available);
        }
      }
    }

    debug(`Downloading Geyser jar at ${pluginDir}`);
    const jar = await fetchGeyserJar(pluginDir, version, filename);
    if (!jar) throw new Error("Failed to fetch Geyser jar.");
    return jar;
  }

  return location;
}

// identify java version and check if it's 8 or higher.
export async function checkJavaVersion(javaLoc: string): Promise<number> {
  // don't know why it's like this, but ti is.
  const { stderr: stdout, exitCode } = await exec(`${javaLoc} -version`);

  if (exitCode != null && exitCode !== 0) {
    throw new Error("Failed to check Java version. Most likely, java is not installed.");
  }

  return await new Promise<number>((resolve, reject) => {
    if (stdout != null) {
      stdout.on("data", (data: string) => {
        const version = data.split(" ")[2].replace(/"/g, "");
        const major = parseInt(version.split(".")[0]);
        resolve(major);
      });
    }
  });
}

export async function openViaProxyGUI(javaLoc: string, fullpath: string, cwd: string, javaArgs: string[]) {
  console.log("opening ViaProxy. This is done to add your account.\nSimply close the window when you're done to allow the mineflayer code to continue.");

  const test = exec(VIA_PROXY_CMD(javaLoc, fullpath, {cli: false, javaArgs}), { cwd: cwd });

  await new Promise<void>((resolve, reject) => {
    test.on("close", (code) => {
      resolve();
    });

    test.on("error", (err) => {
      reject(err);
    });

    test.on("exit", (code) => {
      resolve();
    });
  });
}


export async function loadProxySaves(cwd: string, javaLoc: string, location: string, javaArgs: string[]): Promise<ViaProxySettings> {
  const loc = join(cwd, "saves.json");

  if (!existsSync(loc)) {
    debug("No saves.json found. Initializing by running ViaProxy help command.");
    
    // Append --help to the command string
    const cmdString = `${VIA_PROXY_CMD(javaLoc, location, {cli: true, javaArgs})} --help`;
    debug(`Running command: ${cmdString}`);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(cmdString, { 
        cwd, 
        shell: true 
      });

      const errorBuffer: string[] = [];

      // 1. Log stdout in real-time
      child.stdout.on("data", (data) => {
        debug(`[ViaProxy Output]: ${data.toString().trim()}`);
      });

      // 2. Log stderr in real-time AND buffer it for error handling
      child.stderr.on("data", (data) => {
        const str = data.toString();
        debug(`[ViaProxy Error]: ${str.trim()}`);
        errorBuffer.push(str);
      });

      // Handle the process exit
      child.on("close", (code) => {
        if (code === 0) {
          debug("ViaProxy initialization finished successfully.");
          resolve();
        } else {
          const completeErrorMessage = errorBuffer.join('');
          reject(new Error(`ViaProxy failed to initialize (Exit Code: ${code}).\n\nStderr Output:\n${completeErrorMessage}`));
        }
      });

      // Handle spawn errors
      child.on("error", (err) => {
        const completeErrorMessage = errorBuffer.join('');
        reject(new Error(`ViaProxy process failed to start: ${err.message}.\n\nStderr Output:\n${completeErrorMessage}`));
      });
    });

    if (!existsSync(loc)) {
      throw new Error(`ViaProxy exited successfully, but 'saves.json' was not created at: ${loc}`);
    }

    const data = JSON.parse(readFileSync(loc, "utf-8"));
    return data;
  }

  const data = JSON.parse(readFileSync(loc, "utf-8"));
  debug("Loaded existing saves.json file for ViaProxy.");
  return data;
}

export async function modifyProxySaves(cwd: string, javaLoc: string, javaArgs: string[], location: string, data: ViaProxyV3Config) {
  const loc = join(cwd, "saves.json");
  const saves = await loadProxySaves(cwd, javaLoc, location, javaArgs);

  // assume v4 now.
  const { newest, key } = latestAccountsKey(saves);
  switch (newest) {
    case 3:
      const dataTyped = data as any as ViaProxyV3Config
      const data1 = (saves as any)[key] as AccountV3[];
      data1.push(...dataTyped.accountsV3);
      break;
    case 4:
      const dataTyped4 = convToV4(data as ViaProxyV3Config);
      const data4 = (saves as any)[key] as AccountV4[];
      data4.push(...dataTyped4.accountsV4);
      break;
    default:
      throw new Error(`Unsupported accounts version: ${newest}`);
  }

  writeFileSync(loc, JSON.stringify(saves, null, 2), "utf-8");
}



type AccountType = { accountType: string };

type LoadSaves = Record<string, unknown>;

// ---- small utilities ----

function assertDepth(depth: number) {
  if (depth < 0) throw new Error("Invalid depth received (below zero). This should never be manually specified.");
}

function latestAccountsKey(saves: LoadSaves) {
  const versions = Object.keys(saves)
    .filter((k) => k.startsWith("accountsV"))
    .map((k) => Number(k.slice("accountsV".length)))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  if (versions.length === 0) throw new Error("No accountsV* keys found in saves.json.");
  const newest = versions[versions.length - 1];
  return { newest, key: `accountsV${newest}` as const };
}

function isBedrock(acc: AccountType): acc is BedrockAccount {
  return acc.accountType?.includes("Bedrock");
}
function isMicrosoft(acc: AccountType): acc is MicrosoftAccount {
  return acc.accountType?.includes("Microsoft");
}

/**
 * Generic “try once, optionally open GUI and retry once” wrapper.
 * - If depth >= 1: never tries to open, just throws/returns
 * - If open=false: never opens, returns -1
 */
async function withSingleRetry<T>(
  depth: number,
  open: boolean,
  onOpen: () => Promise<void>,
  action: () => Promise<T>
): Promise<T> {
  try {
    return await action();
  } catch (err) {
    if (depth >= 1) throw err;
    if (!open) throw err;
    await onOpen();
    return await action();
  }
}

// ---- per-version name extraction ----

function getV3Names(accounts: AccountV3[]) {
  const bedrockNames: string[] = [];
  const javaNames: string[] = [];

  for (const acc of accounts) {
    if (isBedrock(acc)) bedrockNames.push(acc.bedrockSession?.mcChain?.displayName);
    else if (isMicrosoft(acc)) javaNames.push(acc.javaSession?.mcProfile?.name);
  }

  return {
    bedrockNames: bedrockNames.filter(Boolean),
    javaNames: javaNames.filter(Boolean),
    findBedrockIndex: (username: string) =>
      accounts.findIndex((a) => isBedrock(a) && a.bedrockSession?.mcChain?.displayName === username),
    findJavaIndex: (username: string) =>
      accounts.findIndex((a) => isMicrosoft(a) && a.javaSession?.mcProfile?.name === username),
  };
}

function getV4Names(accounts: AccountV4[]) {
  const bedrockNames: string[] = [];
  const javaNames: string[] = [];

  for (const acc of accounts) {
    if (isBedrock(acc)) {
      const jwt1 = acc.minecraftCertificateChain?.identityJwt;
      if (!jwt1) continue;

      const decoded = jwt.decode(jwt1, { complete: true });
      const displayName = decoded ? (decoded.payload as any)?.extraData?.displayName : undefined;
      if (displayName) bedrockNames.push(displayName);
    } else if (isMicrosoft(acc)) {
      const name = acc.minecraftProfile?.name;
      if (name) javaNames.push(name);
    }
  }

  return {
    bedrockNames,
    javaNames,
    // In V4 you extracted bedrock names from JWT; to find the index you need to re-decode per account
    findBedrockIndex: (username: string) =>
      accounts.findIndex((acc) => {
        if (!isBedrock(acc)) return false;
        const jwt1 = acc.minecraftCertificateChain?.identityJwt;
        const decoded = jwt1 ? jwt.decode(jwt1, { complete: true }) : null;
        const dn = decoded ? (decoded.payload as any)?.extraData?.displayName : undefined;
        return dn === username;
      }),
    findJavaIndex: (username: string) =>
      accounts.findIndex((acc) => isMicrosoft(acc) && acc.minecraftProfile?.name === username),
  };
}

// ---- main function ----

export async function identifyAccount(
  username: string,
  bedrock: boolean,
  javaLoc: string,
  javaArgs: string[],
  location: string,
  wantedCwd: string,
  depth = 0,
  open = true
): Promise<number> {
  assertDepth(depth);

  const onOpen = async () => {
    debug(`Opening GUI.\nLocation: ${location}`);
    await openViaProxyGUI(javaLoc,location, wantedCwd,  javaArgs);
  };

  // load saves.json, retry once via GUI if configured
  const saves = await withSingleRetry(
    depth,
    open,
    onOpen,
    async () => await loadProxySaves(wantedCwd, javaLoc, location, javaArgs)
  ).catch(async (err) => {
    // match your original behavior: if load fails and open=false return -1, otherwise throw
    if (!open && depth === 0) {
      debug(`Failed to load saves.json. Not opening GUI as 'open' is false.`);
      return null;
    }
    throw err;
  });

  if (saves == null) return -1;

  const { newest, key } = latestAccountsKey(saves);
  const accounts = (saves as any)[key] as any[];

  // empty accounts handling (same behavior for both versions)
  if (!Array.isArray(accounts) || accounts.length === 0) {
    if (depth >= 1) throw new Error("No accounts found.");
    if (!open) {
      debug(`No users in saves.json found. Not opening GUI as 'open' is false.`);
      return -1;
    }
    debug(`No users in saves.json found. Opening GUI.`);
    await onOpen();
    return identifyAccount(username, bedrock, javaLoc, javaArgs, location, wantedCwd, depth + 1, open);
  }

  // pick version-specific extraction + index finding
  const helper =
    newest === 3 ? getV3Names(accounts as AccountV3[]) :
    newest === 4 ? getV4Names(accounts as AccountV4[]) :
    null;

  if (!helper) throw new Error(`Unsupported account version: ${newest}.`);

  debug(`Available Bedrock users: ${helper.bedrockNames.length ? helper.bedrockNames.join(", ") : "None"}`);
  debug(`Available Java users: ${helper.javaNames.length ? helper.javaNames.join(", ") : "None"}`);

  // validate + maybe open GUI once (same logic for bedrock and java)
  const names = bedrock ? helper.bedrockNames : helper.javaNames;
  const label = bedrock ? "Bedrock" : "Microsoft";

  const exists = names.includes(username);
  if (!exists) {
    if (depth >= 1) {
      if (names.length === 0) throw new Error(`No ${label} accounts found${bedrock ? " (even after opening GUI)" : ""}.`);
      throw new Error(`No ${label} account saved with the account name ${username}.\nOptions: ${names.join(", ")}`);
    }

    if (!open) {
      debug(`No ${label} account saved with the account name ${username}. Not opening GUI as 'open' is false.`);
      return -1;
    }

    debug(`No ${label} account saved with the account name ${username}. Opening GUI.`);
    await onOpen();
    return identifyAccount(username, bedrock, javaLoc, javaArgs, location, wantedCwd, depth + 1, open);
  }

  // return the index
  const idx = bedrock ? helper.findBedrockIndex(username) : helper.findJavaIndex(username);
  return idx;
}


export function configureGeyserConfig(pluginDir: string, localPort: number) {
  const configPath = join(pluginDir, "Geyser/config.yml");

  if (!existsSync(configPath)) {
    throw new Error("Geyser config not found.");
  }

  const config = readFileSync(configPath, "utf-8");
  const parsed = jsyaml.load(config) as any;

  parsed["bedrock"]["port"] = localPort;

  // write back to file.
  const newConfig = jsyaml.dump(parsed);
  writeFileSync(configPath, newConfig);
}
