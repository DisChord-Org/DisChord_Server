import { execSync } from 'child_process';
import fs from 'fs';
import crypto from 'crypto';

/**
 * Handles digital signatures using GPG and file hashing.
 * Ensures package authenticity and integrity within the DisChord ecosystem.
 * * @requires gpg - The GNU Privacy Guard binary must be installed and available in the system PATH.
 * @class SecurityService
 */
export class SecurityService {
    /**
     * The GPG Key Identity (Fingerprint or Email) used for signing.
     * Loaded from the GPG_IDENTITY environment variable.
     * @private
     * @static
     */
    private static readonly GPG_IDENTITY = process.env.GPG_IDENTITY;

    /**
     * Creates a detached ASCII-armored signature for a file using GPG.
     * Generates a new file with the same name plus a '.asc' extension in the same directory.
     * * @param {string} filePath - Absolute or relative path to the file to be signed.
     * @returns {void}
     * @throws {Error} If the file does not exist at the provided path.
     * @throws {Error} If the GPG command fails (e.g., identity not found, binary missing).
     */
    public static signFile(filePath: string): void {
        if (!fs.existsSync(filePath)) throw new Error("File to sign not found");

        try {
            execSync(
                `gpg --batch --yes --local-user ${this.GPG_IDENTITY} --detach-sign --armor "${filePath}"`,
                { stdio: 'pipe' }
            );
        } catch (error: any) {
            console.error("GPG Signing Error:", error.stderr?.toString());
            throw new Error("Failed to sign package with GPG");
        }
    }

    /**
     * Verifies a file's integrity and authenticity against a detached GPG signature.
     * * @param {string} filePath - Path to the original file (e.g., the .zip package).
     * @param {string} signaturePath - Path to the detached signature file (e.g., the .asc file).
     * @returns {boolean} True if the signature is valid and matches the file, false otherwise.
     */
    public static verifySignature(filePath: string, signaturePath: string): boolean {
        if (!fs.existsSync(filePath) || !fs.existsSync(signaturePath)) return false;

        try {
            execSync(`gpg --batch --verify "${signaturePath}" "${filePath}"`, { stdio: 'pipe' });
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Reads the content of an ASCII-armored signature file from disk.
     * Assumes the signature file follows the standard naming convention (filename.asc).
     * * @param {string} filePath - Path to the original signed file.
     * @returns {string | null} The PGP signature block content, or null if the signature file doesn't exist.
     */
    public static getSignatureContent(filePath: string): string | null {
        const sigPath = `${filePath}.asc`;
        return fs.existsSync(sigPath) ? fs.readFileSync(sigPath, 'utf-8') : null;
    }

    /**
     * Generates a SHA-256 hash of a file's content.
     * Used for quick integrity checks without GPG overhead.
     * * @param {string} filePath - Path to the file to hash.
     * @returns {string} The hex-encoded SHA-256 hash string.
     * @throws {Error} If the file cannot be read.
     */
    public static getFileHash(filePath: string): string {
        const fileBuffer = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(fileBuffer).digest('hex');
    }
}
