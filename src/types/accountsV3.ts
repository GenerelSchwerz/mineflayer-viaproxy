
/** Discriminated union over account types */
export type AccountV3 =
  | MicrosoftAccount
  | BedrockAccount;

/** -------------------------
 *  Microsoft (Java) account
 *  ------------------------- */
export interface MicrosoftAccount {
  accountType: "net.raphimc.viaproxy.saves.impl.accounts.MicrosoftAccount";
  javaSession: JavaSession;
}

export interface JavaSession {
  mcProfile: McProfile;
  playerCertificates: PlayerCertificates;
}

export interface McProfile {
  id: string;
  name: string;
  skinUrl: string;
  mcToken: McToken;
}

export interface McToken {
  accessToken: string;
  tokenType: "Bearer";
  expireTimeMs: number;
  xblSisuAuthentication: XblSisuAuthentication;
}

export interface XblSisuAuthentication {
  userToken: XblJwtWithUserHash;
  titleToken: XblJwtWithTitleId;
  xstsToken: XstsToken;
  initialXblSession: InitialXblSession;
}

export interface XblJwtBase {
  token: string;
  expireTimeMs: number;
}

export interface XblJwtWithUserHash extends XblJwtBase {
  userHash: string;
}

export interface XblJwtWithTitleId extends XblJwtBase {
  token: string;
  /** Decimal string per Xbox title catalog */
  titleId: string;
}

export interface XstsToken extends XblJwtWithUserHash {
  displayClaims?: { uhs?: string };
}

export interface InitialXblSession {
  msaToken: MsaToken;
  xblDeviceToken: XblDeviceToken;
}

export interface MsaToken {
  expireTimeMs: number;
  accessToken: string;
  refreshToken: string;
  msaCode: Record<string, unknown>;
}

export interface XblDeviceToken extends XblJwtBase {
  publicKey: string;
  privateKey: string;
  id: string;
  token: string;
  deviceId: string;
}

export interface PlayerCertificates {
  expireTimeMs: number;
  publicKey: string;
  privateKey: string;
  publicKeySignature: string;
  legacyPublicKeySignature: string;
}

/** -------------------------
 *  Bedrock account
 *  ------------------------- */
export interface BedrockAccount {
  accountType: "net.raphimc.viaproxy.saves.impl.accounts.BedrockAccount";
  bedrockSession: BedrockSession;
}

export interface BedrockSession {
  mcChain: McChain;
  playFabToken: PlayFabToken;
  realmsXsts: XstsLike; // Realms-flavored XSTS bundle
}

export interface McChain {
  publicKey: string;
  privateKey: string;
  mojangJwt: string;
  identityJwt: string;
  xuid: string;
  id: string;
  displayName: string;

  xblSisuAuthentication: {
    userToken: XblJwtWithUserHash;
    titleToken: XblJwtWithTitleId;
    xstsToken: XstsToken;
    initialXblSession: InitialXblSession;
  };
}

export interface PlayFabToken {
  expireTimeMs: number;
  entityToken: string;
  entityId: string;
  sessionTicket: string;
  playFabId: string;
  xblXstsToken: XstsLike;
  xblXstsToFullXblSession: Record<string, never> | Record<string, unknown>;
}

export interface XstsLike {
  expireTimeMs: number;
  token: string;
  userHash: string;
  displayClaims?: { uhs?: string };
  xblXstsToFullXblSession?: Record<string, unknown>;
}