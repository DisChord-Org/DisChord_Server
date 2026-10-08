import { Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import Version from '../../utils/version-instance';
import client from '../../index';

export const getVersions = (_req: Request, res: Response) => {
    return res.json(Version.toJSON());
};

export const updateVersions = async (req: Request, res: Response) => {
    const expected = process.env.VERSION_UPDATE_SECRET;
    const secret = req.body?.secret;

    if (!expected || typeof secret !== 'string') return res.status(403).send('Forbidden');

    const a = Buffer.from(secret);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(403).send('Forbidden');

    try {
        const oldVersions = Version.toJSON();
        await Version.refresh();
        const newVersions = Version.toJSON();

        const changes = Object.entries(newVersions)
            .filter(([key, newValue]) => newValue !== oldVersions[key as keyof typeof oldVersions])
            .map(([key, newValue]) => `**${key}:** \`${oldVersions[key as keyof typeof oldVersions]}\` → \`${newValue}\``);

        await client.messages.write('1031279210687385640', {
            content: `**Lista de versiones actualizadas (Petición desde GitHub)**\n${changes.length? changes.join('\n') : 'Sin cambios en las versiones.'}`,
        });

        return res.json({});
    } catch (err) {
        console.error('Error al actualizar versiones:', err);
        return res.status(500).send('Error al actualizar versiones');
    }
};
