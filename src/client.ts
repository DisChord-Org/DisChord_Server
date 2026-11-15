import 'dotenv/config';
import { Client, ParseClient, ParseMiddlewares, UsingClient } from "seyfert";
import { middlewares } from "./middlewares/middlewares";
import { onOptionsError, onPermissionsFail } from "./utils/overrides";

/** The Discord client. It lives in its own module so the HTTP server can use it without importing the entry point. */
const client = new Client({
    commands: {
        prefix: () => {
            return [ '.' ];
        },
        reply: () => true,
        defaults: {
            onOptionsError,
            onPermissionsFail
        }
    }
}) as UsingClient & Client;

client.setServices({
    middlewares: middlewares,
    cache: {
        disabledCache: {
            bans: true,
            emojis: true,
            stickers: true,
            roles: true,
            presences: true,
            stageInstances: true,
            voiceStates: true
        }
    }
});

declare module 'seyfert' {
    interface UsingClient extends ParseClient<Client<true>> {}
    interface RegisteredMiddlewares
    extends ParseMiddlewares<typeof middlewares> {}
}

export default client;
