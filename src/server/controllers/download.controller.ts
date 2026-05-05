import { Request, Response } from 'express';
import semver from 'semver';
import Version from '../../utils/version-instance';
import { getComponentFileName } from '../../utils/utils';

export const downloadComponent = (req: Request, res: Response) => {
    const component = req.params.component as string;
    const version = req.params.version as string;
    const os = req.params.os as string;
    
    const repos = {
        compiler: 'DisChord',
        cli: 'DischordCLI',
        ide: 'DisChord-Code-Studio'
    };

    const repoName = repos[component as keyof typeof repos];
    if (!repoName) return res.status(400).json({ message: "Invalid component" });

    let targetVersion = version;
    if (version === 'latest') targetVersion = Version[component as keyof typeof repos];

    const fileName = getComponentFileName(component as 'cli' | 'ide' | 'compiler', targetVersion, os as 'windows' | 'linux' | 'macos');
    const githubUrl = `https://github.com/DisChord-Org/${repoName}/releases/download/${targetVersion}/${fileName}`;

    return res.redirect(githubUrl);
};

export const checkIdeUpdate = async (req: Request, res: Response) => {
    const { version } = req.params;

    if (!version || typeof version != 'string' || !semver.valid(version)) {
        return res.status(400).json({ error: 'Versión actual inválida o no proporcionada' });
    }

    try {
        const githubUrl = 'https://github.com/DisChord-Org/DisChord-Code-Studio/releases/latest/download/latest.json';
        const response = await fetch(githubUrl);
        
        if (!response.ok) return res.status(204).send();

        const remoteConfig = await response.json();

        if (!remoteConfig.version || !semver.valid(remoteConfig.version)) {
            return res.status(204).send();
        }

        if (semver.gt(remoteConfig.version, version)) {
            return res.json(remoteConfig);
        }

        return res.status(204).send();
    } catch (error) {
        console.error("Error al checkear update:", error);
        return res.status(204).send();
    }
};