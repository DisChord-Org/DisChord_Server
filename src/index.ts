import { Client, ParseClient, ParseMiddlewares } from "seyfert";
import { middlewares } from "./middlewares/middlewares";
import "dotenv/config";

const client = new Client();

client.setServices({
    middlewares: middlewares
});

client.start().then(async () => await client.uploadCommands().catch(error => console.log(error)));

declare module 'seyfert' {
    interface UsingClient extends ParseClient<Client<true>> {}
    interface RegisteredMiddlewares
    extends ParseMiddlewares<typeof middlewares> {}
}

require('./api/main');

process.on('unhandledRejection', async (err) => {
    console.error(err);
});