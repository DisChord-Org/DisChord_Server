import fs from 'fs';
import path from 'path';

import StorageService from './StorageService';

/**
 * Append-only record of what happened to the registry (one JSON object per line in `audit.log`).
 * A package registry is only as trustworthy as the trail of who allowed and signed what.
 */
export class AuditLog {
    public static get path(): string {
        return path.join(StorageService.ReposBaseDir, 'audit.log');
    }

    /**
     * @param event Short name of what happened, e.g. `package.signed`.
     * @param data Details. Include `actor` (a Discord id) whenever the caller knows it.
     */
    public static record(event: string, data: Record<string, unknown> = {}): void {
        try {
            fs.appendFileSync(AuditLog.path, `${JSON.stringify({ at: new Date().toISOString(), event, ...data })}\n`, 'utf-8');
        } catch (error) {
            // Losing a log line must never break the action itself.
            console.error('No se pudo escribir en el registro de auditoría:', error);
        }
    }
}
