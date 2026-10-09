import LibraryManager from '../libraries/LibraryManager';
import StorageService from '../libraries/StorageService';
import TrustUsersService from '../libraries/TrustUsersService';
import { RepositoryData, TrustUser, TrustUserRole } from '../libraries/types';
import { UserError } from '../pkg/actions';

export { UserError };

/** Words the commands use for each role. */
export const RoleNames = { adm: TrustUserRole.Admin, contrib: TrustUserRole.Contributor } as const;

export const roleLabel = (role: TrustUserRole): string => role === TrustUserRole.Admin ? 'Adm' : 'Contrib';

/**
 * Role of the person acting.
 * @throws {UserError} If they are not a validated trust user.
 */
export function actorRole(actorId: string): TrustUserRole {
    const user = TrustUsersService.getUser(actorId);
    if (!user) throw new UserError('Para ejecutar este comando debes estar validado en el servidor.');
    return user.role;
}

/** @throws {UserError} Unless the actor is an administrator. Every admin-only action starts with this check, whatever buttons the UI showed. */
export function assertAdmin(actorId: string): void {
    if (actorRole(actorId) !== TrustUserRole.Admin) throw new UserError('No tienes permiso para hacer esto.');
}

function requireUser(id: string): TrustUser {
    const user = TrustUsersService.getUser(id);
    if (!user) throw new UserError('No existe el usuario.');
    return user;
}

export function addTrustUser(actorId: string, id: string, role: TrustUserRole): string {
    assertAdmin(actorId);
    if (!TrustUsersService.isValidId(id)) throw new UserError('El id de usuario no es válido (deben ser solo números).');

    try {
        TrustUsersService.addUser({ id, role, allowedRepos: [], createdAt: Date.now() });
    } catch (error) {
        throw new UserError((error as Error).message);
    }

    return `Usuario ${id} (${role === TrustUserRole.Admin ? 'adm' : 'contrib'}) ha sido agregado.`;
}

/** Removes a user; nobody can remove themselves or the last administrator, so the server is never left without one. */
export function removeTrustUser(actorId: string, id: string): string {
    assertAdmin(actorId);
    const user = requireUser(id);

    if (id === actorId) throw new UserError('No puedes eliminarte a ti mismo.');
    if (user.role === TrustUserRole.Admin && TrustUsersService.getUsers().filter(u => u.role === TrustUserRole.Admin).length <= 1) {
        throw new UserError('No se puede eliminar al último administrador.');
    }

    TrustUsersService.removeUser(id);
    return 'Usuario eliminado.';
}

export function allowRepoToUser(actorId: string, id: string, repoName: string): string {
    assertAdmin(actorId);
    const user = requireUser(id);

    if (!StorageService.getRepo(repoName)) throw new UserError('No existe el repositorio.');
    if (user.allowedRepos.includes(repoName)) throw new UserError('El usuario ya tiene agregado ese repositorio.');

    try {
        TrustUsersService.allowRepositoryToUser(id, repoName);
    } catch (error) {
        throw new UserError(`Error al agregar repositorio al usuario:\n    ${(error as Error).message}`);
    }

    return `Repositorio ${repoName} agregado a ${id}`;
}

/** Downloads the latest release of a repository the actor is allowed to manage. */
export async function registerLatestVersion(actorId: string, repoName: string): Promise<string> {
    const repo = StorageService.getRepo(repoName);
    if (!repo) throw new UserError('No existe el repositorio.');

    if (!TrustUsersService.canUserManageRepo(actorId, repo.name)) throw new UserError('No puedes agregar nuevas versiones a ese repositorio.');

    try {
        await LibraryManager.registerAndDownload(repo);
    } catch (error) {
        throw new UserError(`Error al agregar registrar la release (latest):\n    ${(error as Error).message}`);
    }

    return `Versión latest de ${repo.name} registrada.`;
}

export function describeUser(user: TrustUser): string {
    return `${user.id}\n-   ${roleLabel(user.role)}\n-   ${new Date(user.createdAt).toDateString()}\n-   ${user.allowedRepos.length > 0 ? 'Repositorios:\n' : 'Sin repositorios.'}${user.allowedRepos.map(repo => `      - ${repo}`).join('\n')}`;
}

export function listTrustUsers(filter?: string): string {
    return TrustUsersService.getUsers()
        .filter(user => !filter || user.id.includes(filter) || user.allowedRepos.includes(filter))
        .map(describeUser)
        .join('\n');
}

/** Repositories a user may manage: all of them for administrators, their whitelist otherwise. */
export function manageableRepos(actorId: string): RepositoryData[] {
    const user = TrustUsersService.getUser(actorId);
    if (!user) return [];

    return Object.values(StorageService.getRepos())
        .filter(repo => user.role === TrustUserRole.Admin || user.allowedRepos.includes(repo.name))
        .sort((a, b) => a.name.localeCompare(b.name));
}
