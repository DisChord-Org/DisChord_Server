import { createMiddleware } from "seyfert";
 
export const staffMiddleware = createMiddleware<void>(
    async (middle) => {
        const guild = await middle.context.client.guilds.fetch('1031230207606149191');
        const member = await guild.members.fetch(middle.context.author.id);

        if (!member.roles.keys.includes('1031233001297821766')) return middle.context.write({ content: 'Solo **los CEO** pueden ejecutar este comando.' });

        return middle.next();
    }
);