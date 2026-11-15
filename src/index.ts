import 'dotenv/config';
import client from './client';
import { checkEnvironment } from './utils/env';
import './server/main';

checkEnvironment();

client.start().then(async () => {
    await client.uploadCommands().catch(error => console.log(error));
});

process.on('unhandledRejection', async (err) => {
    console.error(err);
});

export default client;
