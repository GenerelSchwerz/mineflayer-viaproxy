export const BASE_VIAPROXY_URL = "https://ci.viaversion.com/view/Platforms/job/ViaProxy/lastStableBuild" //"https://github.com/ViaVersion/ViaProxy";
export const BASE_GEYSER_URL = "https://download.geysermc.org/v2/projects/geyser";


interface CMDOpts {
    cli?: boolean
    javaArgs?: string[]
}

export const VIA_PROXY_CMD = (java_loc: string, loc: string, opts: CMDOpts = {}) => {

    let cmd = java_loc;

    if (opts.javaArgs)
        for (const jArg of opts.javaArgs) {
            cmd += " "
            cmd += jArg;
        }
    
    cmd += " -jar " + `"${loc}"` + (opts.cli ? " cli" : "")

    return cmd;
};
