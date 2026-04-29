import path from 'path';
import fs from 'fs';
import StorageService from "./StorageService";
import { RepositoryData, TrustUser, TrustUserRole } from './types';

/**
 * Service responsible for managing trusted users and their permissions.
 * Handles the persistence of user profiles and defines access control logic 
 * for repository management.
 * @class TrustUsersService
 */
class TrustUsersService {
    /**
     * Directory where user profile JSON files are stored.
     * Default: [ReposBaseDir]/Users
     */
    public static readonly UsersDir: string = path.join(StorageService.ReposBaseDir, 'Users');

    constructor() {
        this.initStructure();
    }

    /**
     * Ensures the users directory exists on system startup.
     * @private
     */
    private initStructure(): void {
        if (!fs.existsSync(TrustUsersService.UsersDir)) {
            fs.mkdirSync(TrustUsersService.UsersDir, { recursive: true });
        }
    }

    /**
     * Registers a new trusted user into the system.
     * Persists the user data as a JSON file named after the user ID.
     * * @param {TrustUser} user - The user object to be registered.
     * @throws {Error} If a user with the same ID already exists.
     * @returns {void}
     */
    public static addUser (user: TrustUser): void {
        const userPath = path.join(this.UsersDir, `${user.id}.json`);
        if (fs.existsSync(userPath)) throw new Error(`El usuario ${user.id} ya existe.`);

        fs.writeFileSync(userPath, JSON.stringify(user, null, 4));
    }

    /**
     * Deletes a user profile and revokes all their associated permissions.
     * * @param {TrustUser['id']} id - The unique identifier of the user to remove.
     * @returns {void}
     */
    public static removeUser (id: TrustUser['id']): void {
        const userPath = path.join(this.UsersDir, `${id}.json`);
        if (fs.existsSync(userPath)) {
            fs.unlinkSync(userPath);
        }
    }

    /**
     * Retrieves a specific user profile from the storage.
     * * @param {TrustUser['id']} id - The unique identifier of the user.
     * @returns {TrustUser | null} The user data object or null if the user is not found.
     */
    public static getUser (id: TrustUser['id']): TrustUser | null {
        const userPath = path.join(this.UsersDir, `${id}.json`);
        if (!fs.existsSync(userPath)) return null;

        return JSON.parse(fs.readFileSync(userPath, 'utf-8'));
    }

    /**
     * Retrieves all registered trusted users.
     * Scans the users directory and parses every JSON file found.
     * @returns {TrustUser[]} An array of all registered TrustUser objects.
     */
    public static getUsers (): TrustUser[] {
        const users: TrustUser[] = [];

        for (const file of fs.readdirSync(this.UsersDir)) {
            const fileContent = fs.readFileSync(path.join(this.UsersDir, file), 'utf-8');

            users.push(JSON.parse(fileContent));
        }

        return users;
    }

    /**
     * Gets the role assigned to a specific user.
     * * @param {TrustUser['id']} id - The unique identifier of the user.
     * @returns {TrustUser['role']} The role of the user.
     * @throws {Error} If the user does not exist.
     */
    public static getUserRole (id: TrustUser['id']): TrustUser['role'] {
        const user = TrustUsersService.getUser(id);
        if (!user) throw new Error(`El usuario ${id} no existe.`);
        return user.role;
    }

    /**
     * Core Authorization logic. Checks if a user has sufficient permissions
     * to manage or upload versions for a specific repository.
     * @param {TrustUser['id']} id - The user identifier.
     * @param {RepositoryData['name']} repoName - The name of the repository.
     * @returns {boolean} True if user is Admin or is whitelisted for the repo; false otherwise.
     */
    public static canUserManageRepo (id: TrustUser['id'], repoName: RepositoryData['name']): boolean {
        const user = this.getUser(id);
        if (!user) return false;
        if (user.role === TrustUserRole.Admin) return true;
        return user.allowedRepos.includes(repoName);
    }

    /**
     * Checks for the existence of a user in the registry.
     * * @param {TrustUser['id']} id - The identifier to check.
     * @returns {boolean} True if the user profile exists.
     */
    public static existsUser (id: TrustUser['id']): boolean {
        return !!TrustUsersService.getUser(id);
    }

    /**
     * Adds a repository name to the user's whitelist of allowed repositories.
     * This method effectively updates the user's permission set.
     * @param {TrustUser['id']} id - The identifier of the user.
     * @param {RepositoryData['name']} repository - The name of the repository to allow.
     * @throws {Error} If the user does not exist.
     * @throws {Error} If the repository is already in the user's whitelist.
     * @returns {void}
     */
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