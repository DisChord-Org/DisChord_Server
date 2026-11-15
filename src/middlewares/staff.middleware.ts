import { createMiddleware } from "seyfert";
import { DiscordIds } from "../utils/constants";
 
export const staffMiddleware = createMiddleware<void>(
    async (middle) => {
        const guild = await middle.context.client.guilds.fetch(DiscordIds.Guild);
        const member = await guild.members.fetch(middle.context.author.id);

        if (!member.roles.keys.includes(DiscordIds.StaffRole)) return middle.context.write({ content: 'Solo **los CEO** pueden ejecutar este comando.' });

        return middle.next();
    }
);