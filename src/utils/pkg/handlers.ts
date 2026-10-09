import { TrustPolicy } from '../libraries/TrustPolicy';
import { TrustLevel } from '../libraries/types';
import {
    addPackage, allowVersion, deletePackage, getLocalVersion, isVersionAllowed, listPackages,
    modifyPackage, signVersion, updatePackage, UserError, type PackageChanges
} from './actions';

export { UserError, withTrustLevel } from './actions';

/**
 * A `pkg text` subcommand: the old terminal-style interface, kept as an escape route.
 * `args` includes the command word itself at index 0.
 * Handlers return the text to show and throw UserError for anything the user can fix.
 */
export interface PkgHandler {
    names: string[];
    /** Minimum number of words (command included) needed to run it. */
    minArgs: number;
    usage: string;
    run(args: string[]): Promise<string> | string;
}

const add: PkgHandler = {
    names: [ 'add' ],
    minArgs: 4,
    usage: 'Modo de uso:\nadd <pkg>\n    < official (o) | trust (t) | unknown (u) >\n    <repository>\n    <description>',
    run: (args) => addPackage({
        name: args[1],
        trustLevel: TrustPolicy.parseLevel(args[2]) ?? TrustLevel.Unknown,
        githubUrl: args[3],
        description: args.slice(4).join(' ')
    })
};

const list: PkgHandler = {
    names: [ 'list', 'lst' ],
    minArgs: 1,
    usage: '',
    run: (args) => listPackages(args[1])
};

const remove: PkgHandler = {
    names: [ 'delete', 'del' ],
    minArgs: 2,
    usage: 'Modo de uso:\ndel <pkg>',
    run: (args) => deletePackage(args[1])
};

const modify: PkgHandler = {
    names: [ 'modify', 'md' ],
    minArgs: 4,
    usage: 'Modo de uso:\nmd <pkg>\n    < official (o) | trust (t) | unknown (u) | - >\n    <repository | - >\n    < description | - >',
    run(args) {
        const changes: PackageChanges = {};

        if (args[2] !== '-') {
            const parsed = TrustPolicy.parseLevel(args[2]);
            if (parsed === undefined) throw new UserError(`Nivel de confianza no válido: '${args[2]}'. Usa official (o), trust (t), unknown (u) o -.`);
            changes.trustLevel = parsed;
        }
        if (args[3] !== '-') changes.githubUrl = args[3];
        if (args[4] !== undefined && args[4] !== '-') changes.description = args.slice(4).join(' ');

        return modifyPackage(args[1], changes);
    }
};

const isAllowed: PkgHandler = {
    names: [ 'is-allowed', 'illw' ],
    minArgs: 3,
    usage: 'Modo de uso:\nillw <pkg> <version>',
    run: (args) => isVersionAllowed(args[1], args[2])
};

const allowWithDownload: PkgHandler = {
    names: [ 'allow-with-download', 'llw' ],
    minArgs: 3,
    usage: 'Modo de uso:\nllw <pkg> <version>',
    run: (args) => allowVersion(args[1], args[2])
};

const getVersion: PkgHandler = {
    names: [ 'get-version', 'gv' ],
    minArgs: 2,
    usage: 'Modo de uso:\ngv <pkg>',
    run: (args) => getLocalVersion(args[1])
};

const sign: PkgHandler = {
    names: [ 'sign', 'sg' ],
    minArgs: 3,
    usage: 'Modo de uso:\nsg <pkg> <version>',
    run: (args) => signVersion(args[1], args[2])
};

const update: PkgHandler = {
    names: [ 'update', 'up' ],
    minArgs: 2,
    usage: 'Modo de uso:\nup <pkg>',
    run: (args) => updatePackage(args[1])
};

export const pkgHandlers: PkgHandler[] = [ add, list, remove, modify, isAllowed, allowWithDownload, getVersion, sign, update ];

/** Finds the handler registered for a command word (case-insensitive). */
export function findPkgHandler(command: string | undefined): PkgHandler | undefined {
    if (!command) return undefined;
    const name = command.toLowerCase();
    return pkgHandlers.find(handler => handler.names.includes(name));
}
