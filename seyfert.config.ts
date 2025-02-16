// @ts-check
const { config } = require('seyfert');

module.exports = config.bot({
    token: process.env.BOT_TOKEN,
    intents: [ "Guilds", "GuildModeration", "GuildMembers", "GuildIntegrations", "GuildScheduledEvents", "GuildMessages" ],
    locations: {
        base: "dist",
        // output: "dist",
        commands: "commands",
        events: "events"
    }
});