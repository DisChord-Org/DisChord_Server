import { Request, Response } from 'express';
import client from '../../client';
import { DiscordIds } from '../../utils/constants';

/** Body fields end up inside a Discord message: keep them short and unable to break out of their code span. */
const field = (value: unknown, max: number = 100): string => {
    if (typeof value !== 'string' && typeof value !== 'number') return 'desconocido';

    return String(value).replace(/[`\r\n]/g, ' ').trim().slice(0, max) || 'desconocido';
};

/** Authentication is done by `requireInternalSecret` before this handler runs. */
export const handleSSHLogin = async (req: Request, res: Response) => {
    const user = field(req.body?.user);
    const ip = field(req.body?.ip);
    const date = field(req.body?.date);
    const allowed_mentions = { parse: [] };

    const results = await Promise.allSettled([
        client.messages.write(DiscordIds.LogChannel, {
            content: `**Acceso SSH**\n**Usuario:** \`${user}\`\n**Fecha:** \`${date}\``,
            allowed_mentions
        }),
        client.users.write(DiscordIds.Owner, {
            content: `**Acceso SSH**\n**Usuario:** \`${user}\`\n**Fecha:** \`${date}\`\n**IP:** \`${ip}\``,
            allowed_mentions
        })
    ]);

    for (const result of results) {
        if (result.status === 'rejected') console.error('Error al avisar de un acceso SSH:', result.reason);
    }

    return res.status(200).send('OK');
};
