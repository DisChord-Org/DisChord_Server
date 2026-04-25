import { Request, Response } from 'express';
import Version from '../../utils/version-instance';
import { getComponentFileName } from '../../utils/utils';
import { isNewer } from '../../utils/utils';

export const redirectToOS = (req: Request, res: Response) => {
    const { component, version } = req.params;
    const userAgent = req.headers['user-agent'] || '';

    let os: 'windows' | 'linux' | 'macos' = 'linux';
    
    if (req.query.os) {
        const queryOS = String(req.query.os).toLowerCase();
        if (['windows', 'linux', 'macos'].includes(queryOS)) {
            os = queryOS as 'windows' | 'linux' | 'macos';
        }
    } else {
        const ua = userAgent.toLowerCase();
        if (ua.includes('win')) os = 'windows';
        else if (ua.includes('mac')) os = 'macos';
    }
    
    return res.redirect(`/download/${component}/${version}/${os}`);
};

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
    const version = req.params.version as string;
    
    try {
        const githubUrl = 'https://github.com/DisChord-Org/DisChord-Code-Studio/releases/latest/download/latest.json';
        const response = await fetch(githubUrl);
        if (!response.ok) return res.status(204).send();

        const remoteConfig = await response.json();
        if (isNewer(remoteConfig.version, version)) {
            return res.json(remoteConfig);
        }

        return res.status(204).send();
    } catch (error) {
        console.error("Error al checkear update:", error);
        return res.status(204).send();
    }
};