export enum AuthType {
    NONE = "NONE",
    OPENAUTHMOD = "OPENAUTHMOD",
    ACCOUNT = "ACCOUNT",
}

export interface ViaProxyOpts {
    javaPath?: string;
    localPort?: number;
    localAuth?: AuthType,
    viaProxyLocation?: string;
    viaProxyWorkingDir?: string;
    autoUpdate?: boolean;
    viaProxyStdoutCb?: (data: any) => void
    viaProxyStderrCb?: (data: any) => void

}


