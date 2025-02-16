import { createEvent } from 'seyfert';

export default createEvent({
    data: { name: 'ready' },
    run(user: any, client: any) {
        client.logger.info(`Bot Online (${user.username})`);
    }
});