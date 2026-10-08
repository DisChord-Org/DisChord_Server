import { createEvent } from "seyfert";

export default createEvent({
    data: {
        name: 'ready',
        once: true
    },
    run: async (_user, client) => {
        await client.messages.write('1031279210687385640', {
            content: `-# **Servidor online.**`,
        });
    }
})