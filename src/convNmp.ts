import { Bot, BotOptions } from "mineflayer";
import * as viaproxyTypes from "./types/config"
import path from 'path'
import fs from "fs/promises"
import { ClientOptions } from "minecraft-protocol";
import { validateOptions } from "./utils";
import * as crypto from "crypto";
import { Authflow, Titles } from "prismarine-auth";


import { v4 as uuidv4 } from 'uuid';

const { createHash } = require("prismarine-auth/src/common/Util");


/**
 * Generate cache file name for a given username
 */
export function generateCacheFileName(pathName: string, cacheName: string, username: string): string {
    return path.join(pathName, `${createHash(username)}_${cacheName}-cache.json`)
}


export async function* extractCacheNames(opts: BotOptions) {
    const profileFolder = validateOptions(opts).profilesFolder;

    // confirm profile folder exists
    if (!(await fs.stat(profileFolder).catch(() => false))) {
        return [];
    }

    const files = await fs.readdir(profileFolder);
    const hash = createHash(opts.username);
    for (const file of files) {
        if (file.startsWith(hash) && file.endsWith("-cache.json")) {
            const cacheName = file.substring(hash.length + 1, file.length - "-cache.json".length);
            yield cacheName;
        }
    }
}


export async function loadNmpConfig(opts: BotOptions) {

    const sanitizedOpts = validateOptions(opts);

    const caches = [];
    for await (const cacheName of extractCacheNames(opts)) {
        caches.push(cacheName);
    }

    console.log("Found caches: ", caches);

    // confirm that 'live', 'mca', and 'xbl' are present
    const requiredCaches = ['live', 'mca', 'xbl'];
    for (const req of requiredCaches) {
        if (!caches.includes(req)) {
            throw new Error(`Missing required cache: ${req}`);
        }
    }

    const cacheMap: Record<string, any> = {};
    for (const cacheName of caches) {
        const cacheFile = generateCacheFileName(sanitizedOpts.profilesFolder, cacheName, sanitizedOpts.username);
        console.log(`Loading cache ${cacheName} from ${cacheFile}`);
        const data = await fs.readFile(cacheFile, 'utf-8');
        const parsed = JSON.parse(data);
        cacheMap[cacheName] = parsed;
    }



    // Use your cache folder / username so tokens persist
    const flow = new Authflow(opts.username, sanitizedOpts.profilesFolder, {
       authTitle: Titles.MinecraftNintendoSwitch, deviceType: 'Nintendo', flow: 'live'
    });

    const mcMgr = await flow.getMinecraftJavaToken({fetchCertificates: true, fetchProfile: true});
    // This ensures the access token is fresh and the profile keys are fetched/cached
    

    // --- from a5032f_mca-cache.json ---
    const mca = cacheMap['mca'];
    const mcAccessToken = mca.mca.access_token;
    const mcExpireTimeMs = mca.mca.obtainedOn + mca.mca.expires_in * 1000;
    // mca.mca.pfd[0] holds the Java profile id & name in your file.
    const mcProfileId = mca.mca.username;         // "9e88ba5b-39b4-46e2-b06d-c67b6fe87233"
    const mcProfileName = sanitizedOpts.username       // "Generel_Schwerz"

    // --- from a5032f_xbl-cache.json ---
    const xbl = cacheMap['xbl'];
    const userToken = xbl.userToken.Token;
    const userTokenExp = Date.parse(xbl.userToken.NotAfter);
    const titleToken = xbl.titleToken.Token;
    const titleTokenExp = Date.parse(xbl.titleToken.NotAfter);
    const xstsToken = xbl["30f115"].XSTSToken;
    const xstsUserHash = xbl["30f115"].userHash;       // also in DisplayClaims.xui[0].uhs
    const deviceToken = xbl.deviceToken.Token;        // DID is in deviceToken.DisplayClaims.xdi.did

    // --- from a5032f_live-cache.json ---
    const live = cacheMap['live'];
    const msaAccessToken = live.token.access_token;
    const msaRefreshToken = live.token.refresh_token;
    const msaExpireTimeMs = live.token.obtainedOn + live.token.expires_in * 1000;

    const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })

    const publicKey = mcMgr.certificates.profileKeys.public.export({ type: 'spki', format: 'pem' });
    const privateKey = mcMgr.certificates.profileKeys.private.export({ type: 'pkcs8', format: 'pem' });

    const expiresOn = (mcMgr.certificates as any).profileKeys.expiresOn;
    const publicKeySignature = (mcMgr.certificates.profileKeys as any).signatureV2.toString('base64');
    const legacyPublicKeySignature = (mcMgr.certificates.profileKeys as any).signature.toString('base64')    

    const combined = {
        accountsV3: [
            {
                accountType: "net.raphimc.viaproxy.saves.impl.accounts.MicrosoftAccount",
                javaSession: {
                    mcProfile: {
                        id: mcProfileId,
                        name: mcProfileName,
                        // Missing from caches; you’d fetch from Mojang/Textures given uuid:
                        skinUrl: "TODO_FETCH_FROM_PROFILE_API",
                        mcToken: {
                            accessToken: mcAccessToken,
                            tokenType: "Bearer",
                            expireTimeMs: mcExpireTimeMs,
                            xblSisuAuthentication: {
                                userToken: {
                                    token: userToken,
                                    expireTimeMs: userTokenExp,
                                    userHash: xbl.userToken.DisplayClaims?.xui?.[0]?.uhs ?? xstsUserHash
                                },
                                titleToken: {
                                    token: titleToken,
                                    expireTimeMs: titleTokenExp,
                                    titleId: xbl.titleToken.DisplayClaims?.xti?.tid?.toString?.() ?? "TODO_TITLE_ID"
                                },
                                xstsToken: {
                                    token: xstsToken,
                                    expireTimeMs: Date.now() + 3600_000,
                                    userHash: xstsUserHash,
                                    displayClaims: { uhs: xstsUserHash }
                                },
                                initialXblSession: {
                                    msaToken: {
                                        accessToken: msaAccessToken,
                                        refreshToken: msaRefreshToken,
                                        expireTimeMs: msaExpireTimeMs,
                                        msaCode: {}
                                    },
                                    xblDeviceToken: {
                                        publicKey: keyPair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
                                        privateKey: keyPair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
                                        id: uuidv4(),
                                        deviceId: xbl.deviceToken.DisplayClaims?.xdi?.did ?? "TODO_DEVICE_ID",
                                        expireTimeMs: Date.parse(xbl.deviceToken.NotAfter),
                                        token: deviceToken
                                    }
                                }
                            }
                        }
                    },
                   
                    playerCertificates: {
                        expireTimeMs: Date.parse(expiresOn),
                        publicKey: publicKey.toString('utf-8').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n|\r/g, ''),
                        privateKey: privateKey.toString('utf-8').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n|\r/g, ''),
                        publicKeySignature: publicKeySignature,
                        legacyPublicKeySignature: legacyPublicKeySignature
                    }
                }
            },
        ],
        ui: {
        }
    };


    console.log("Constructed viaproxy config: ", combined.accountsV3[0]);
    return combined as viaproxyTypes.ViaProxySettings;
}


