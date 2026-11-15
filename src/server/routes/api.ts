import { Router } from 'express';
import * as VersionController from '../controllers/version.controller';
import * as DownloadController from '../controllers/download.controller';
import * as InternalController from '../controllers/internal.controller';
import * as PackageController from '../controllers/package.controller';
import { asyncHandler } from '../middlewares/error.middleware';
import { requireInternalSecret } from '../middlewares/internal-auth.middleware';
import { resolvePackage } from '../middlewares/package.middleware';
import { internalAuthRateLimit, updateRateLimit } from '../middlewares/ratelimit.middleware';

const router = Router();

/** Versions routes */
router.get('/versions', VersionController.getVersions);
router.post('/versions/update', updateRateLimit, requireInternalSecret, asyncHandler(VersionController.updateVersions));

/** Download routes */
router.get('/download/:component/:version/:os', DownloadController.downloadComponent);
router.get('/download/:component/:version/:os/checksum', asyncHandler(DownloadController.componentChecksum));

/** Internal routes */
router.post('/internal/ssh-login', internalAuthRateLimit, requireInternalSecret, asyncHandler(InternalController.handleSSHLogin));

/** IDE routes */
router.get('/ide/update/:platform/:version', asyncHandler(DownloadController.checkIdeUpdate));

/** Package routes */
router.get('/packages', asyncHandler(PackageController.getPackages));
router.get('/packages/:repo/:version', asyncHandler(resolvePackage()), PackageController.getPackage);
router.get('/packages/:repo/:version/download', asyncHandler(resolvePackage('Package not found in registry')), PackageController.downloadPackage);
router.get('/packages/:repo/:version/sign/download', asyncHandler(resolvePackage('Package not found in registry')), PackageController.downloadPackageSign);

export default router;
