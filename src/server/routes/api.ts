import { Router } from 'express';
import * as VersionController from '../controllers/version.controller';
import * as DownloadController from '../controllers/download.controller';
import * as InternalController from '../controllers/internal.controller';
import * as PackageController from '../controllers/package.controller';

const router = Router();

/** Versions routes */
router.get('/versions', VersionController.getVersions);

/** Download routes */
router.get('/download/:component/:version/:os', DownloadController.downloadComponent);

/** Internal routes */
router.post('/internal/ssh-login', InternalController.handleSSHLogin);

/** IDE routes */
router.get('/ide/update/:platform/:version', DownloadController.checkIdeUpdate);

/** Package routes */
router.get('/packages', PackageController.getPackages);
router.get('/packages/:repo/:version', PackageController.getPackage);
router.get('/packages/:repo/:version/download', PackageController.downloadPackage);
router.get('/packages/:repo/:version/sign/download', PackageController.downloadPackageSign);

export default router;