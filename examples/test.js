const {createBot} = require('../');


(async () => {
    const bot = await createBot({
        host: process.argv[2],
        port: parseInt(process.argv[3]),
        auth: "microsoft",
        username: process.argv[4] ?? "Generel_Schwerz",
        forceViaProxy: true,
        profilesFolder: "./cache",

        // viaProxyStderrCb: (data) => console.log(data.toString()),
        // viaProxyStdoutCb: (data) => console.log(data.toString()),

        viaProxyConfig: {
            // targetVersion: "1.21-1.21.1",
            // backendProxyUrl: "socks5://vyrhcaww:dwnbbhgoewtt@82.27.247.251:5585",
            ignoreProtocolTranslationErrors: true, // ignore-protocol-translation-errors
        }

    })

    bot.on('login', () => {
        console.log("Logged in");
    });

    bot.on("spawn", async () => {
        console.log("Bot spawned");
        await bot.waitForTicks(20);
        bot.chat("hi");
    });

    bot.on('chat', (username, message) => {
        console.log(`[${username}] ${message}`);
    })

    // debug events
    bot.on("kicked", console.log.bind(null, 'bot.on("kicked")'));
    bot.on("end", console.log.bind(null, 'bot.on("end")'));
    bot.on("error", console.log.bind(null, 'bot.on("error")'));
    bot._client.on("error", console.log.bind(null, 'bot._client.on("error")'));
    bot._client.on("end", console.log.bind(null, 'bot._client.on("end")'));
})();
