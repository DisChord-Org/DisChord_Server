import path from 'path';
import fs from 'fs';
import StorageService from "./StorageService";
import { RepositoryData, TrustUser, TrustUserRole } from './types';

class TrustUsersService {
    public static readonly UsersDir: string = path.join(StorageService.ReposBaseDir, 'Users');

    constructor() {
        this.initStructure();
    }

    private initStructure(): void {
        if (!fs.existsSync(TrustUsersService.UsersDir)) {
            fs.mkdirSync(TrustUsersService.UsersDir, { recursive: true });
        }
    }

    public static addUser (user: TrustUser): void {
        const userPath = path.join(this.UsersDir, `${user.id}.json`);
        if (fs.existsSync(userPath)) throw new Error(`El usuario ${user.id} ya existe.`);

        fs.writeFileSync(userPath, JSON.stringify(user, null, 4));
    }

    public static removeUser (id: TrustUser['id']): void {
        const userPath = path.join(this.UsersDir, `${id}.json`);
        if (fs.existsSync(userPath)) {
            fs.unlinkSync(userPath);
        }
    }

    public static getUser (id: TrustUser['id']): TrustUser | null {
        const userPath = path.join(this.UsersDir, `${id}.json`);
        if (!fs.existsSync(userPath)) return null;

        return JSON.parse(fs.readFileSync(userPath, 'utf-8'));
    }

    public static getUsers (): TrustUser[] {
        const users: TrustUser[] = [];

        for (const file of fs.readdirSync(this.UsersDir)) {
            const fileContent = fs.readFileSync(path.join(this.UsersDir, file), 'utf-8');

            users.push(JSON.parse(fileContent));
        }

        return users;
    }

    public static getUserRole (id: TrustUser['id']): TrustUser['role'] {
        const user = TrustUsersService.getUser(id);
        if (!user) throw new Error(`El usuario ${id} no existe.`);
        return user.role;
    }

    public static canUserManageRepo (id: TrustUser['id'], repoName: RepositoryData['name']): boolean {
        const user = this.getUser(id);
        if (!user) return false;
        if (user.role === TrustUserRole.Admin) return true;
        return user.allowedRepos.includes(repoName);
    }

    public static existsUser (id: TrustUser['id']): boolean {
        return !!TrustUsersService.getUser(id);
    }

    public static allowRepositoryToUser (id: TrustUser['id'], repository: RepositoryData['name']): void {
        const user = TrustUsersService.getUser(id);
        if (!user) throw new Error(`El usuario ${id} no existe.`);

        if (user.allowedRepos.includes(repository)) throw new Error(`El usuario ${id} ya tiene agregado ese repositorio.`);
        user.allowedRepos.push(repository);

        TrustUsersService.removeUser(id);
        TrustUsersService.addUser(user);
    }
}

new TrustUsersService();

export default TrustUsersService;