import { Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import semver from 'semver';
import Version from '../../utils/version-instance';
import client from '../../client';
import { DiscordIds } from '../../utils/constants';

export const getVersions = (_req: Request, res: Response) => {
    return res.json(Version.toJSON());
};

/** Authentication is done by `requireInternalSecret` before this handler runs. */
export const updateVersions = async (_req: Request, res: Response) => {
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

        await client.messages.write(DiscordIds.LogChannel, {
            content: `**Lista de versiones actualizadas (Petición desde GitHub)**\n${changes.length? changes.join('\n') : 'Sin cambios en las versiones.'}`,
        });

        res.json({ deploying });

        if (deploying) {
            await client.messages.write(DiscordIds.LogChannel, {
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
