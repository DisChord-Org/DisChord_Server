import './api/main';

process.on('unhandledRejection', async (err) => {
    console.error(err);
});