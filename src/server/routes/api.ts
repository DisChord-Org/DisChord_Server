import { Router } from 'express';
import * as VersionController from '../controllers/version.controller';
import * as DownloadController from '../controllers/download.controller';
import * as InternalController from '../controllers/internal.controller';

const router = Router();

/** Versions routes */
router.get('/versions', VersionController.getVersions);

/** Download routes */
router.get('/download/:component/:version', DownloadController.redirectToOS);
router.get('/download/:component/:version/:os', DownloadController.downloadComponent);

/** Internal routes */
router.post('/internal/ssh-login', InternalController.handleSSHLogin);

/** IDE routes */
router.get('/ide/update/:platform/:version', DownloadController.checkIdeUpdate);

export default router;