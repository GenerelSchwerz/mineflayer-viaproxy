export enum AuthType {
    NONE = "NONE",
    OPENAUTHMOD = "OPENAUTHMOD",
    ACCOUNT = "ACCOUNT",
}

export interface ViaProxyOpts {
    forceViaProxy?: boolean;
    javaPath?: string;
    localPort?: number;
    localAuth?: AuthType,
    viaProxyLocation?: string;
    viaProxyWorkingDir?: string;
    autoUpdate?: boolean;
    viaProxyConfig?: Partial<ViaProxyConfig>;
    viaProxyStdoutCb?: (data: any) => void
    viaProxyStderrCb?: (data: any) => void
}

export interface ViaProxyConfig {
    backendProxyUrl: string;
    [key: string]: string | number | boolean;
}


export { ViaProxySettings} from './config'