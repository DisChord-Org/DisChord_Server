import { Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { spawn } from 'child_process';
import path from 'path';
import semver from 'semver';
import Version from '../../utils/version-instance';
import client from '../../index';

export const getVersions = (_req: Request, res: Response) => {
    return res.json(Version.toJSON());
};

export const updateVersions = async (req: Request, res: Response) => {
    const expected = process.env.INTERNAL_SECRET;
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

        const latestServerVersion = await Version.fetchLatestVersion('DisChord_Server');
        const deploying = !!semver.valid(latestServerVersion) && !!semver.valid(Version.server) && semver.gt(latestServerVersion, Version.server);
        if (deploying) changes.push(`**server:** \`${Version.server}\` → \`${latestServerVersion}\``);

        await client.messages.write('1031279210687385640', {
            content: `**Lista de versiones actualizadas (Petición desde GitHub)**\n${changes.length? changes.join('\n') : 'Sin cambios en las versiones.'}`,
        });

        res.json({ deploying });

        if (deploying) {
            await client.messages.write('1031279210687385640', {
                content: `-# Reiniciando servidor para actualizar a la versión \`${latestServerVersion}\`...`,
            }).catch(err => console.error('Error al avisar del reinicio:', err));

            const script = path.resolve(__dirname, '../../../scripts/restart_script.sh');
            setTimeout(() => spawn('bash', [ script, latestServerVersion ], { detached: true, stdio: 'ignore' }).unref(), 1000);
        }
        
        return;

    } catch (err) {
        console.error('Error al actualizar versiones:', err);
        if (res.headersSent) return;
        return res.status(500).send('Error al actualizar versiones');
    }
};
