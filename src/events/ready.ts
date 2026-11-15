import { createEvent } from "seyfert";
import { DiscordIds } from "../utils/constants";

export default createEvent({
    data: {
        name: 'ready',
        once: true
    },
    run: async (_user, client) => {
        await client.messages.write(DiscordIds.LogChannel, {
            content: `-# **Servidor online.**`,
        });
    }
})