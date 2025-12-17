import { AccountV3 } from "./accountsV3";

// Root shape
export type ViaProxySettings = ViaProxyV3Config | ViaProxyV4Config;
export type ViaProxyV3Config = {
  ui: UISettings;
  accountsV3: AccountV3[];
}

export type ViaProxyV4Config = {
  
  ui: UISettings;
  accountsV4: any[];

}
/** -------------------------
 *  UI settings
 *  ------------------------- */
export interface UISettings {
  proxy: string;
  "notice.bedrock_warning": "true" | "false";
  "legacy_skin_loading": "true" | "false";
  server_address: string;
  "notice.ban_warning": "true" | "false";
  bind_address: string;
}


export * as ConfigV3 from './accountsV3'
export * as ConfigV4 from './accountsV4'