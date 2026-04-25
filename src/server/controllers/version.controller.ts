import { Request, Response } from 'express';
import Version from '../../utils/version-instance';

export const getVersions = (_req: Request, res: Response) => {
    return res.json({
        server: Version.server,
        compiler: Version.compiler,
        cli: Version.cli,
        ide: Version.ide
    });
};