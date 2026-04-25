import { Request, Response } from 'express';
import client from '../../index';

export const handleSSHLogin = (req: Request, res: Response) => {
    const { user, ip, date, secret } = req.body;

    if (secret !== process.env.INTERNAL_SECRET) return res.status(403).send('Forbidden');

    client.messages.write('1031279210687385640', {
        content: `**Acceso SSH**\n**Usuario:** \`${user}\`\n**Fecha:** ${date}`
    });

    client.users.createDM('760769497358794783', true);
    client.users.write('760769497358794783', {
        content: `**Acceso SSH**\n**Usuario:** \`${user}\`\n**Fecha:** ${date}\n**IP:** ${ip}`
    })

    return res.status(200).send('OK');
};