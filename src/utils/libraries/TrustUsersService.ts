import path from 'path';
import fs from 'fs';
import StorageService from "./StorageService";

export enum TrustUserRole {
    Admin = 0,
    Contributor = 1
}

export interface TrustUser {
    id: string;
    role: TrustUserRole;
    allowedRepos: string[];
    createdAt: number;
}

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

    public static removeUser (id: string): void {
        const userPath = path.join(this.UsersDir, `${id}.json`);
        if (fs.existsSync(userPath)) {
            fs.unlinkSync(userPath);
        }
    }

    public static getUser (id: string): TrustUser | null {
        const userPath = path.join(this.UsersDir, `${id}.json`);
        if (!fs.existsSync(userPath)) return null;

        return JSON.parse(fs.readFileSync(userPath, 'utf-8'));
    }

    public static getUserRole (id: string): TrustUser['role'] {
        const user = TrustUsersService.getUser(id);
        if (!user) throw new Error(`El usuario ${id} no existe.`);
        return user.role;
    }

    public static canUserManageRepo (id: string, repoName: string): boolean {
        const user = this.getUser(id);
        if (!user) return false;
        if (user.role === TrustUserRole.Admin) return true;
        return user.allowedRepos.includes(repoName);
    }

    public static existsUser (id: string): boolean {
        return !!TrustUsersService.getUser(id);
    }
}

export default TrustUsersService;