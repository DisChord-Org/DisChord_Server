import { Client, ParseClient, ParseMiddlewares, UsingClient } from "seyfert";
import { middlewares } from "./middlewares/middlewares";
import "dotenv/config";
import { onOptionsError, onPermissionsFail } from "./utils/overrides";
import './api/main';
import dotenv from 'dotenv';

dotenv.config();

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

client.start().then(async () => {
    await client.uploadCommands().catch(error => console.log(error));
});

declare module 'seyfert' {
    interface UsingClient extends ParseClient<Client<true>> {}
    interface RegisteredMiddlewares
    extends ParseMiddlewares<typeof middlewares> {}
}

process.on('unhandledRejection', async (err) => {
    console.error(err);
});

export default client;