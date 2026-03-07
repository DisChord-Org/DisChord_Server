import './api/main';
import dotenv from 'dotenv';

dotenv.config();

process.on('unhandledRejection', async (err) => {
    console.error(err);
});