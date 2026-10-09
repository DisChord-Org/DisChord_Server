import fs from 'fs';
import os from 'os';
import path from 'path';
import { vi } from 'vitest';

/**
 * Loads a fresh copy of the library modules pointed at an empty temporary storage directory,
 * so tests never touch the real `Repositories` folder.
 */
export async function loadStorage() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dischord-test-'));
    process.env.DISCHORD_REPOS_DIR = dir;
    vi.resetModules();

    const { default: StorageService } = await import('../src/utils/libraries/StorageService');
    const { default: LibraryManager } = await import('../src/utils/libraries/LibraryManager');
    const types = await import('../src/utils/libraries/types');
    const handlers = await import('../src/utils/pkg/handlers');

    return { dir, StorageService, LibraryManager, ...types, ...handlers };
}
