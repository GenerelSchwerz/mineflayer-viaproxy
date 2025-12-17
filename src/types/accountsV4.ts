/** Root save file (v4) */
export interface ViaProxySaveV4 {
  accountsV4: AccountV4[];
  ui: Record<string, unknown>;
}

/** Discriminated union over account types */
export type AccountV4 = MicrosoftAccountV4 | BedrockAccountV4;

/** Common "saveVersion" marker used throughout v4 */
export interface SaveVersioned {
  _saveVersion: number;
}

/** -------------------------
 *  Common sub-structures
 *  ------------------------- */

export interface MsaApplicationConfigV4 extends SaveVersioned {
  clientId: string;
  scope: string;
  environment: "LIVE" | string;
}

/** EC (P-256) keypair: public is SPKI DER base64, private is PKCS8 DER base64 */
export interface EcKeyPairV4 {
  algorithm: "EC";
  publicKey: string;
  privateKey: string;
}

/** RSA keypair: public is SPKI DER base64, private is PKCS8 DER base64 */
export interface RsaKeyPairV4 {
  algorithm: "RSA";
  publicKey: string;
  privateKey: string;
}

/** Generic token container used widely in v4 */
export interface ExpiringTokenV4 extends SaveVersioned {
  expireTimeMs: number;
  token: string;
}

/** MSA token bundle */
export interface MsaTokenV4 extends SaveVersioned {
  expireTimeMs: number;
  accessToken: string;
  refreshToken: string;
}

/** XBL tokens have different payloads (deviceId/titleId/userHash etc.) */
export interface XblDeviceTokenV4 extends SaveVersioned {
  expireTimeMs: number;
  token: string;
  deviceId: string;
}

export interface XblUserTokenV4 extends SaveVersioned {
  expireTimeMs: number;
  token: string;
  userHash: string;
}

export interface XblTitleTokenV4 extends SaveVersioned {
  expireTimeMs: number;
  token: string;
  /** Decimal string in some ecosystems, but v4 stores it as a string; keep flexible. */
  titleId: string;
}

/** XSTS-like token (in your sample: "javaXstsToken", "bedrockXstsToken", "playFabXstsToken") */
export interface XstsTokenV4 extends SaveVersioned {
  expireTimeMs: number;
  token: string;
  userHash: string;
}

/** Minecraft "bearer" token */
export interface MinecraftTokenV4 extends SaveVersioned {
  expireTimeMs: number;
  type: "Bearer" | string;
  token: string;
}

export interface MinecraftProfileV4 extends SaveVersioned {
  id: string;
  name: string;
}

/** Certificates used for Java edition player chat/auth */
export interface MinecraftPlayerCertificatesV4 extends SaveVersioned {
  expireTimeMs: number;
  keyPair: RsaKeyPairV4;
  publicKeySignature: string;
  legacyPublicKeySignature: string;
}

/** PlayFab token bundle (Bedrock) */
export interface PlayFabTokenV4 extends SaveVersioned {
  expireTimeMs: number;
  entityId: string;
  entityToken: string;
  playFabId: string;
  sessionTicket: string;
}

/** Minecraft session (Bedrock) */
export interface MinecraftSessionV4 extends SaveVersioned {
  expireTimeMs: number;
  authorizationHeader: string;
}

export interface MinecraftMultiplayerTokenV4 extends SaveVersioned {
  expireTimeMs: number;
  token: string;
}

/** Certificate chain container (Bedrock) */
export interface MinecraftCertificateChainV4 extends SaveVersioned {
  mojangJwt: string;
  identityJwt: string;
}

/** -------------------------
 *  Microsoft account (v4)
 *  ------------------------- */
export interface MicrosoftAccountV4 extends SaveVersioned {
  accountType: "net.raphimc.viaproxy.saves.impl.accounts.MicrosoftAccount";

  msaApplicationConfig: MsaApplicationConfigV4;
  deviceType: "Win32" | "Android" | string;

  deviceKeyPair: EcKeyPairV4;
  deviceId: string;

  msaToken: MsaTokenV4;

  xblDeviceToken: XblDeviceTokenV4;
  xblUserToken: XblUserTokenV4;
  xblTitleToken: XblTitleTokenV4;

  /** Present in your sample on the Microsoft account */
  javaXstsToken: XstsTokenV4;

  minecraftToken: MinecraftTokenV4;
  minecraftProfile: MinecraftProfileV4;

  minecraftPlayerCertificates: MinecraftPlayerCertificatesV4;
}

/** -------------------------
 *  Bedrock account (v4)
 *  ------------------------- */
export interface BedrockAccountV4 extends SaveVersioned {
  accountType: "net.raphimc.viaproxy.saves.impl.accounts.BedrockAccount";

  msaApplicationConfig: MsaApplicationConfigV4;
  deviceType: "Android" | "Win32" | string;

  deviceKeyPair: EcKeyPairV4;
  deviceId: string;

  /** Only Bedrock entry in your sample has this extra keypair */
  sessionKeyPair: EcKeyPairV4 | EcdsaP384KeyPairV4;

  msaToken: MsaTokenV4;

  xblDeviceToken: XblDeviceTokenV4;
  xblUserToken: XblUserTokenV4;
  xblTitleToken: XblTitleTokenV4;

  /** Bedrock- and PlayFab-flavored XSTS tokens */
  bedrockXstsToken: XstsTokenV4;
  playFabXstsToken: XstsTokenV4;

  playFabToken: PlayFabTokenV4;

  minecraftSession: MinecraftSessionV4;
  minecraftMultiplayerToken: MinecraftMultiplayerTokenV4;
  minecraftCertificateChain: MinecraftCertificateChainV4;
}

/**
 * In your sample, Bedrock's sessionKeyPair public key is longer and starts with "MHYw..."
 * which is typical of P-384 SPKI encodings. Keep this as a separate option in case
 * ViaProxy uses P-384 for session keys on Bedrock.
 */
export interface EcdsaP384KeyPairV4 {
  algorithm: "EC";
  publicKey: string;
  privateKey: string;
}
