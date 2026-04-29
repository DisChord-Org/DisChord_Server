import { Middlewares, Declare, Command, type CommandContext, IgnoreCommand } from 'seyfert';
import LibraryManager from '../utils/libraries/LibraryManager';
import StorageService from '../utils/libraries/StorageService';
import TrustUsersService from '../utils/libraries/TrustUsersService';
import { TrustUser, TrustUserRole } from '../utils/libraries/types';

@Declare({
    name: "trust",
    description: "Gestiona los paquetes y usuarios permitidos del servidor",
    ignore: IgnoreCommand.Slash
})

@Middlewares([ 'trustuser' ])

export default class TrustCommand extends Command {
    private content: string[] = [];

    private addContent (args: string[], message: string, addEndIndicator: boolean = true): string {
        if (this.content.length >= 12) this.content.splice(2, 1);
        this.content.push(`> ${args.join(' ')}`, `${message}`);
        return this.getContent(addEndIndicator);
    }

    private getContent (addEndIndicator: boolean = true): string {
        const content = `\`\`\`bash\n${this.content.join('\n')}${addEndIndicator ? '\n> ' : ''}\`\`\``;
        if (content.length > 2000) return 'El contenido es demasiado largo para ser mostrado.';

        return content;
    }

    private validateCommand (args: string[], role: TrustUserRole): boolean {
        if (role === TrustUserRole.Contributor && ['stp', 'stop', 'cls', 'clear', 'lstusr', 'list-users', 'gusr', 'get-user-role', 'addv', 'add-version'].includes(args[0])) {
            this.addContent(args, 'No tienes permiso para acceder a este comando.');
            return false;
        }

        return true;
    }

    async run (ctx: CommandContext) {
        const UserRole = TrustUsersService.getUserRole(ctx.author.id);
        if (UserRole === TrustUserRole.Admin) {
            this.content = [ '# Introduzca comandos para la gestión de usuarios y sus paquetes', 'stp (stop) | cls (clear) | addusr (add-user) | lstusr (list-users) [user] | delusr (delete-user) | gusr (get-user-role)\nllr (allow-repo) | addv (add-version)' ];
        } else {
            this.content = [ '# Introduzca comandos para la gestión de sus paquetes', 'stp (stop) | cls (clear) | lstusr (list-users) [user] | gusr (get-user-role)\naddv (add-version)' ];
        }

        const message = await ctx.write({ content: this.getContent() }, true);
        
        ctx.client.collectors.create({
            event: 'MESSAGE_CREATE',
            filter: (arg) => arg.author.id === ctx.author.id,
            timeout: 60000,
            run: async (arg, stop): Promise<void> => {
                const args = arg.content.trim().split(/\s+/);
                const command = args[0]?.toLowerCase();
                arg.delete();

                if (!this.validateCommand(args, UserRole)) {
                    message.edit({ content: this.getContent() });
                    return;
                }

                switch (command) {
                    case 'add-user':
                    case 'addusr':
                        if (args.length < 3) {
                            message.edit({ content: this.addContent(args, 'Modo de uso:\naddusr <id> <adm | contrib>') });
                            return;
                        }

                        const addUserId = args[1];
                        const addUserRole = args[2];

                        if (![ 'adm', 'contrib' ].includes(addUserRole)) {
                            message.edit({ content: this.addContent(args, 'Modo de uso:\nadduser <id> <adm | contrib>') });
                            return;
                        }

                        TrustUsersService.addUser({
                            id: addUserId,
                            role: addUserRole === 'adm'? TrustUserRole.Admin : TrustUserRole.Contributor,
                            allowedRepos: [],
                            createdAt: Date.now()
                        });

                        message.edit({ content: this.addContent(args, `Usuario ${addUserId} (${addUserRole}) ha sido agregado.`) });
                        return;
                    case 'list-users':
                    case 'lstusr':
                        const users = TrustUsersService.getUsers().filter(user => !args[1] || user.id.includes(args[1]) || user.allowedRepos.includes(args[1]));

                        message.edit({ content: this.addContent(args, users.map(user => `${user.id}\n-   ${user.role === TrustUserRole.Admin? 'Adm' : 'Contrib'}\n-   ${new Date(user.createdAt).toDateString()}\n-   ${user.allowedRepos.length > 0? 'Repositorios:\n' : 'Sin repositorios.'}${user.allowedRepos.map(repo => `      - ${repo}`).join('\n')}`).join('\n')) });
                        return;
                    case 'delete-user':
                    case 'delusr':
                        if (args.length < 2) {
                            message.edit({ content: this.addContent(args, 'Modo de uso:\ndeluser <id>') });
                            return;
                        }

                        const delUserId = args[1];

                        if (!TrustUsersService.existsUser(delUserId)) {
                            message.edit({ content: this.addContent(args, 'No existe el usuario.') });
                            return;
                        }

                        TrustUsersService.removeUser(delUserId);
                        message.edit({ content: this.addContent(args, 'Usuario eliminado.') });
                        return;
                    case 'get-user-role':
                    case 'gusr':
                        if (args.length < 2) {
                            message.edit({ content: this.addContent(args, 'Modo de uso:\ngusr <id>') });
                            return;
                        }

                        const getUserId = args[1];

                        if (!TrustUsersService.existsUser(getUserId)) {
                            message.edit({ content: this.addContent(args, 'No existe el usuario.') });
                            return;
                        }

                        const getUserRole = TrustUsersService.getUserRole(getUserId);
                        message.edit({ content: this.addContent(args, getUserRole === TrustUserRole.Admin? 'adm' : 'contrib') });
                        return;
                    case 'allow-repo':
                    case 'llr':
                        if (args.length < 3) {
                            message.edit({ content: this.addContent(args, 'Modo de uso:\nllr <id> <repo>') });
                            return;
                        }

                        const allowUserId = args[1];
                        const allowRepoName = args[2];

                        if (!TrustUsersService.existsUser(allowUserId)) {
                            message.edit({ content: this.addContent(args, 'No existe el usuario.') });
                            return;
                        }

                        if (!StorageService.getRepo(allowRepoName)) {
                            message.edit({ content: this.addContent(args, 'No existe el repositorio.') });
                            return;                            
                        }

                        const allowUser = TrustUsersService.getUser(allowUserId) as TrustUser;

                        if (allowUser.allowedRepos.includes(allowRepoName)) {
                            message.edit({ content: this.addContent(args, 'El usuario ya tiene agregado ese repositorio.') });
                            return;
                        }

                        try {
                            TrustUsersService.allowRepositoryToUser(allowUserId, allowRepoName);
                        } catch (error) {
                            message.edit({ content: this.addContent(args, `Error al agregar repositorio al usuario:\n    ${(error as Error).message}`) });
                            return;
                        }

                        message.edit({ content: this.addContent(args, `Repositorio ${allowRepoName} agregado a ${allowUserId}`) });
                        return;
                    case 'add-version':
                    case 'addv':
                        if (args.length < 3) {
                            message.edit({ content: this.addContent(args, 'Modo de uso:\naddv <repo>') });
                            return;
                        }

                        const addRepo = StorageService.getRepo(args[1]);

                        if (!addRepo) {
                            message.edit({ content: this.addContent(args, 'No existe el repositorio.') });
                            return;
                        }

                        if (TrustUsersService.canUserManageRepo(ctx.author.id, addRepo.name)) {
                            message.edit({ content: this.addContent(args, 'No puedes agregar nuevas versiones a ese repositorio.') });
                            return;
                        }

                        try {
                            LibraryManager.registerAndDownload(addRepo);
                        } catch (error) {
                            message.edit({ content: this.addContent(args, `Error al agregar registrar la release (latest):\n    ${(error as Error).message}`) });
                            return;
                        }

                        message.edit({ content: this.addContent(args, `Versión latest de ${addRepo.name} registrada.`) });
                        return;
                    case 'clear':
                    case 'cls':
                        this.content.splice(2, this.content.length - 2);
                        message.edit({ content: this.getContent() });
                        return;
                    case 'stop':
                    case 'stp':
                        stop();
                        return;
                }

                message.edit({ content: this.addContent(args, 'Comando no encontrado.') });
                return;
            },
            onStop: () => {
                message.edit({ content: this.addContent(['stp'], 'Sesión detenida.', false) });
            }
        });
    }
}