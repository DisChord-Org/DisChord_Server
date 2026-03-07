// @ts-check
import { GatewayIntentBits } from "seyfert/lib/types/index.js";
import { config } from "seyfert";

const base = process.argv.includes("--dev") ? "src" : "dist";

export default config.bot({
    token: process.env.BOT_TOKEN ?? '',
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages
    ],
    locations: {
        base,
        commands: "commands",
        // events: "events"
    }
});