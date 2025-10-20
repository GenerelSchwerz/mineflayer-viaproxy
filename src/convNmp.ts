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

    // const publicKeySignature = mcMgr.certificates.profileKeys.publicPEM;
    const expiresOn = (mcMgr.certificates as any).profileKeys.expiresOn;
    const legacyPublicKeySignature = (mcMgr.certificates.profileKeys as any).signature.toString('base64')
    
    const publicKeySignature = (mcMgr.certificates.profileKeys as any).signatureV2.toString('base64');

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
                   
                    "playerCertificates": {
                        "expireTimeMs": Date.parse(expiresOn),
                        publicKey: publicKey.toString('utf-8').replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\n|\r/g, ''),
                        privateKey: privateKey.toString('utf-8').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n|\r/g, ''),
                        publicKeySignature: publicKeySignature,
                        legacyPublicKeySignature: legacyPublicKeySignature
                        // "publicKey": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA25pgjQLDnIxDU0NyQJFjp9OODL7W7bNk15VxcwRpGVwapBeJRxuuTyGIstkcAed/c51KQAg0StvgdrMrLd/Gd4yAY1DcZCmGmh5L/dxUkMPfdNbU78e06yZubTHVQLgTZMLKiIBFmcg33lCV1jmYUQChwqTBQzG2ps/HeVC/cQhREm57lF+ZTC0Dl6+4TK6t8ilOIjcRTg+IW5OdAjgc/cbYeaLviEGgv77TdyvIdZ8x3qh9L8UvdqacNzFnIjh6iMirT93YdPhDO0WYxEC53jHv2DQPUeRwSWurepMiqXqKUBrY1WiiGbt0ZE00MHLdpnx+lhiWvirmaltLV+iRAwIDAQAB",
                        // "privateKey": "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDbmmCNAsOcjENTQ3JAkWOn044Mvtbts2TXlXFzBGkZXBqkF4lHG65PIYiy2RwB539znUpACDRK2+B2syst38Z3jIBjUNxkKYaaHkv93FSQw9901tTvx7TrJm5tMdVAuBNkwsqIgEWZyDfeUJXWOZhRAKHCpMFDMbamz8d5UL9xCFESbnuUX5lMLQOXr7hMrq3yKU4iNxFOD4hbk50COBz9xth5ou+IQaC/vtN3K8h1nzHeqH0vxS92ppw3MWciOHqIyKtP3dh0+EM7RZjEQLneMe/YNA9R5HBJa6t6kyKpeopQGtjVaKIZu3RkTTQwct2mfH6WGJa+KuZqW0tX6JEDAgMBAAECggEADclSTb1NBH31wrtq58zOLHy73+b3Mp20M1M+zRFg0REW3Ghchj9MS8wiJdWQIY/OpjZ2BoZn/1nFwg3wzwTLvo5D3SL4GGhW+plI/LChX86RhRHw9PYHpfTtXSOSF2m2+04TTaB9PhtIuUc7241qwjhqRKr34Ge1kiFcjNbZ6JbsTUFBX7oOXvIp9Ovk8Xh/UL1fJrrEOw8NwuqWApb88NIWWgSWqWSJ4wTaHcH/Qzk/JQqQpCqkFo+Tr/dFjqgjjPVscISoqyW4X5z57X4RZXDgXnm3xhr8EjDNSJKkxmlxlWejGpHlMVLMYETHpfNM3SdXA0I8CJEKf8+t1nulgQKBgQDrmnX8LLulnlfOdBJ7vXFuHdrKOzuccozL8T6UDjHuQCqF6oDYy/+oGA4WIXXH9TcSSFjiZNXBTJdgPrJhqShmIEcNZCuV5OufWgMRqIDkUTQLuffH5XHjoMpkQirB2c2Ph8MpUB8bUwIhvTVyDi0eKD2OcC4fLVFzqpn1x73hwQKBgQDunU93Btv3RFrYPLLgmBwJTvxJM0qquz3TlZiSFBbN36ov6nphXGH03cbxupXvlZezLevc05EGQzfEOQW9Z3PJghoI52BNe/gYa7jxb7+niZLHObYSi90VGXyplwfJ666426NgpwLmK0DxZXXNChecqY9hUADzywWZxWgBiIZbwwKBgCiIg2HmJEZjDoIzT/a/6eLi+gAu3puUzYpMr9Jy+r4dhfNSG+awegRmVw4RpZzIIDhiAAC7DldaIPTq9G9+1bd0OCUipaj9IFhi+QIxtjMRkV2vGeTnIYfi4s8K3yZInWfjGH1kDmX6CvTZA3fi3npAvA5kWFr+xfObVy+EtLNBAoGBAN5PfBDWOCw46Dac3r93mG9nwo9klUVaK/EsaDh5NQHcR9BasmhxTOZ5lffzMexEwFB1EVHtXympiJRt2BYuA2eTqjPvdf7a6DvAaU+wIKyz9Sdecm73FiSpWUcb6mrLBT8/iwjqsT3GwLvnHojIxVT1eRteEXUSCwbIL+11yFBHAoGAN18H339wZ56LZqjDctgDEm28S2YQZaa+YEbdtm+KG99ge995Nfx0xAIWVnky3EjbNT22KK6E4ahYLtLS+j9lQGAU8w2liD+cd/lbNksz6x5EemRn2rgNlmLIx9k5LXlnSBqbXXp0+KKGvpWf4TQDgZDGWYC5uxZin+F4MeQrXTg\u003d",
                        // "publicKeySignature": "C/Oj/IA12gBUGY6y6bOWWAAOM07JkHIJnET1cSEJewvD56s1t62O7Aw1xsBGNVYqkcOc58BRiFj0WbDU7LIAgLB5UkF8kAxokmDmTR+2YEtXFBgf0u22qM/ZOtgYD0AjYm0eGf3uC+hN60nG66W3+8BQgehQrrmmdYXrkgTA/YdfEBtzCRasV7ah6yjDfk7rtRq+qf2bZeHqUgpdOoMcApX4dbsgDLxAChVl0Yt9bPRExyidPL0L6sFrFcntOfFrQ3bayj376Y3DSIBRHvhJvHT2UlbQrFxQLOefGCO/f4SZ8u5//Tv2hUeZ1Gyxs13PTAWjEpRKStrfkbFCDLcjyNSqsg9ncVXP/eyxSZh56e5N/2KfH1Wsv9nkaFw0AstZwKYVUWwqC45lXj4ot1pe2jvdCAJZiP2TjwWy4XE3dIpa7IzW2DIwqJRQbXt3OJ7tJddP6UQGAmzGKrEnPsBl5jgcrJHQRGSxTIl/g5Lj6Uz61INsOOPeK7am2hz0VQS7ik09UkbrHSTSkYpZ0W4uAYkFZRKNLs35FZzBTNwQfgaE0pbrZKo1w8uM7pUf+ConjnWixqJ8606FJYTr+TJvd5kOeS4e+W1My4NarFX6wx1f/5B+rRvrfyTjwoUaDLnKX0/xHoQHNuIEYmuxD3HLKtny+2yUKHjVijgY+7hJLEg\u003d",
                        // "legacyPublicKeySignature": "fpyQwQKxm8OrR4aKOY8f3OQGbMAJs8lsh8rO53YIU70qPBuecjaSQXNT9ud9AOI/FtyopcqkKFiOKYxiAMFaOlxTlJB4TQuNUVAR7eDqlIVAS0c1oEsQdCzHxQ5epc0KdeqHcPePduQlUorOXeUflHmAwCLrlEuxl+HinzWPYXEbKcCbl2X7Fo1kSRjer5FI/vAloHCM2CtABbYXxJBbDM2zJeBT7pIBfPIGfblbEjXZjmkjgr1IKj2XG+WflofndCr8SDbZE6kzAWGs47esnXhISgLBWp+XNRQ6KY8HCkcxY8p06Q6PNUZ095pdTNn7cPQfCXZp+7wZypf8HN85tHjQaCCE29Elqo9Ll4hsSYgPECjjoU90jjZj2cWjI2fF4scFSrBfOOS4vCvB/EhdTrA9JjLDdhxRtDrr+vTiZdMcHFwsKiNequ7c7OJGQdlkZGj86goQQ2/puB2HU1U5zdHvz3U7xGSCjhwXoh9SML6QE5rDDh+lcW8qHjr6wKzvWNCbMO17wzLVhwcAJt+c6632jICVcwx81HQ7RxcniEZB6OSVMcY2vWLqFilfc64oAqp9dxf8EaJVTG/gKj/SCDVMgINIoOcJGE33WFyADcMWHaZ8zyD+ID4IMvA6dJZCHFe8tJlVZVjWGRY88ekPYupPAxSU96fPPzdfUqm7occ\u003d"
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


