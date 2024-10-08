import { appendFileSync, createWriteStream, existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { Bot } from "mineflayer";
import { BASE_VIAPROXY_URL, BASE_GEYSER_URL, VIA_PROXY_CMD } from "./constants";
import { exec } from "child_process";

import jsyaml from "js-yaml";

const debug = require("debug")("mineflayer-viaproxy");

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


export async function getSupportedMCVersions(javaLoc: string, cwd: string, filename: string): Promise<string[]> {
  // run the jar file to get the supported versions.
  const test = exec(`${VIA_PROXY_CMD(javaLoc, filename, true)} --list-versions`, { cwd: cwd });

  let versions: string[] = [];

  // read from stdout

  let seeStartVersions = false;


  await new Promise<void>((resolve, reject) => {
    let stdOutListener =  (data: string) => {
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

export async function openViaProxyGUI(javaLoc: string, fullpath: string, cwd: string) {
  console.log("opening ViaProxy. This is done to add your account.\nSimply close the window when you're done to allow the mineflayer code to continue.");

  const test = exec(VIA_PROXY_CMD(javaLoc, fullpath, false), { cwd: cwd });

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

export function loadProxySaves(cwd: string) {
  const loc = join(cwd, "saves.json");
  if (!existsSync(loc)) throw new Error("No saves found.");

  return JSON.parse(readFileSync(loc, "utf-8"));
}

export async function identifyAccount(
  username: string,
  bedrock: boolean,
  javaLoc: string,
  location: string,
  wantedCwd: string,
  depth = 0
): Promise<number> {
  if (depth < 0) {
    throw new Error("Invaid depth received (below zero). This should never be manually specified.");
  }

  let saves;
  try {
    saves = loadProxySaves(wantedCwd);
  } catch (err) {
    if (depth >= 1) {
      throw err;
    }
    debug("No saves found. Opening GUI.");
    await openViaProxyGUI(javaLoc, location, wantedCwd);
    return await identifyAccount(username, bedrock, javaLoc, location, wantedCwd, depth + 1);
  }
  
  const accountTypes = Object.keys(saves).filter((k) => k.startsWith("account"));
  const newestAccounts = accountTypes.map((k) => parseInt(k.split("V")[1])).sort((a, b) => a - b);
  const newestKey = newestAccounts[newestAccounts.length - 1];
  const accounts: Record<string, any>[] = saves[`accountsV${newestKey}`];

  switch (newestKey) {
    case 3: {
      // get all bedrock usernames using .reduce()

      if (accounts.length === 0) {
        if (depth >= 1) {
          throw new Error("No accounts found.");
        }
        debug(`No users in saves.json found Opening GUI.\nLocation: ${location}`);
        await openViaProxyGUI(javaLoc, location, wantedCwd);
        return await identifyAccount(username, bedrock, javaLoc, location, wantedCwd, depth + 1);
      }

      const bdAccNames: string[] = []; //accounts.reduce((prev, cur) => (cur.accountType.includes("Bedrock") ? prev.push(cur.bedrockSession.mcChain.displayName) && prev : prev), []) as unknown as string[];
      const msAccNames: string[] = []; //accounts.reduce((prev, cur) => (cur.accountType.includes("Microsoft") ? prev.push(cur.javaSession.mcProfile.name) && prev : prev), []) as unknown as string[];

      for (const acc of accounts) {
        if (acc.accountType.includes("Bedrock")) bdAccNames.push(acc.bedrockSession.mcChain.displayName);
        else if (acc.accountType.includes("Microsoft")) msAccNames.push(acc.javaSession.mcProfile.name);
      }

      debug(`Available Bedrock users: ${bdAccNames.length > 0 ? bdAccNames.join(", ") : "None"}`);
      debug(`Available Java users: ${msAccNames.length > 0 ? msAccNames.join(", ") : "None"}`);

      if (bedrock) {
        if (bdAccNames.length === 0 || !bdAccNames.includes(username)) {
          if (depth >= 1) {
            if (bdAccNames.length === 0) throw new Error("No bedrock accounts found (even after opening GUI).");
            else throw new Error(`No Bedrock account saved with the account name ${username}.\nOptions: ${bdAccNames.join(", ")}`);
          }
          await openViaProxyGUI(javaLoc, location, wantedCwd);
          return await identifyAccount(username, bedrock, javaLoc, location, wantedCwd, depth + 1);
        }

        // console.log(accounts.map(acc => acc.bedrockSession.mcChain.displayName))
        const idx = accounts.findIndex((acc) => acc.bedrockSession?.mcChain.displayName === username);
        return idx;
      } else {
        if (msAccNames.length === 0 || !msAccNames.includes(username)) {
          if (depth >= 1) {
            if (msAccNames.length === 0) throw new Error("No Microsoft accounts found.");
            else throw new Error(`No Microsoft account saved with the account name ${username}.\nOptions: ${msAccNames.join(", ")}`);
          }
          await openViaProxyGUI(javaLoc, location, wantedCwd);
          return await identifyAccount(username, bedrock, javaLoc, location, wantedCwd, depth + 1);
        }

        const idx = accounts.findIndex((acc) => acc.javaSession?.mcProfile.name === username);
        return idx;
      }
    }
    default:
      throw new Error(`Unsupported account version: ${newestKey}.`);
  }
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
