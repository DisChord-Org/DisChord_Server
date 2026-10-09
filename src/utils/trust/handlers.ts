import TrustUsersService from '../libraries/TrustUsersService';
import { TrustUserRole } from '../libraries/types';
import { addTrustUser, allowRepoToUser, listTrustUsers, registerLatestVersion, removeTrustUser, UserError } from './actions';
import { roleFromWord } from './views';

/**
 * A `trust text` subcommand: the old terminal-style interface, kept as an escape route.
 * `args` includes the command word itself at index 0.
 */
export interface TrustHandler {
    names: string[];
    /** Minimum number of words (command included) needed to run it. */
    minArgs: number;
    usage: string;
    /** Only administrators may run it. Checked here and again inside the action. */
    adminOnly: boolean;
    run(args: string[], actorId: string): Promise<string> | string;
}

const addUser: TrustHandler = {
    names: [ 'add-user', 'addusr' ],
    minArgs: 3,
    usage: 'Modo de uso:\naddusr <id> <adm | contrib>',
    adminOnly: true,
    run(args, actorId) {
        const role = roleFromWord(args[2]);
        if (role === undefined) throw new UserError(addUser.usage);

        return addTrustUser(actorId, args[1], role);
    }
};

const listUsers: TrustHandler = {
    names: [ 'list-users', 'lstusr' ],
    minArgs: 1,
    usage: '',
    adminOnly: false,
    run: (args) => listTrustUsers(args[1])
};

const deleteUser: TrustHandler = {
    names: [ 'delete-user', 'delusr' ],
    minArgs: 2,
    usage: 'Modo de uso:\ndelusr <id>',
    adminOnly: true,
    run: (args, actorId) => removeTrustUser(actorId, args[1])
};

const getUserRole: TrustHandler = {
    names: [ 'get-user-role', 'gusr' ],
    minArgs: 2,
    usage: 'Modo de uso:\ngusr <id>',
    adminOnly: false,
    run(args) {
        const user = TrustUsersService.getUser(args[1]);
        if (!user) throw new UserError('No existe el usuario.');

        return user.role === TrustUserRole.Admin ? 'adm' : 'contrib';
    }
};

const allowRepo: TrustHandler = {
    names: [ 'allow-repo', 'llr' ],
    minArgs: 3,
    usage: 'Modo de uso:\nllr <id> <repo>',
    adminOnly: true,
    run: (args, actorId) => allowRepoToUser(actorId, args[1], args[2])
};

const addVersion: TrustHandler = {
    names: [ 'add-version', 'addv' ],
    minArgs: 2,
    usage: 'Modo de uso:\naddv <repo>',
    adminOnly: false,
    run: (args, actorId) => registerLatestVersion(actorId, args[1])
};

export const trustHandlers: TrustHandler[] = [ addUser, listUsers, deleteUser, getUserRole, allowRepo, addVersion ];

/** Finds the handler registered for a command word (case-insensitive). */
export function findTrustHandler(command: string | undefined): TrustHandler | undefined {
    if (!command) return undefined;
    const name = command.toLowerCase();
    return trustHandlers.find(handler => handler.names.includes(name));
}
