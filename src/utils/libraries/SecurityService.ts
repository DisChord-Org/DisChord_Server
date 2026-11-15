import { execFile } from 'child_process';
import fs from 'fs';
import crypto from 'crypto';

/**
 * Handles digital signatures using GPG and file hashing.
 * Ensures package authenticity and integrity within the DisChord ecosystem.
 * * @requires gpg - The GNU Privacy Guard binary must be installed and available in the system PATH.
 * @class SecurityService
 */
export class SecurityService {
    /** A gpg that waits for a passphrase nobody will type must not keep a download open forever. */
    private static readonly GPG_TIMEOUT_MS = 60_000;

    /**
     * The GPG Key Identity (Fingerprint or Email) used for signing.
     * Read from the GPG_IDENTITY environment variable at call time.
     * @private
     * @static
     */
    private static get GPG_IDENTITY(): string | undefined {
        return process.env.GPG_IDENTITY;
    }

    /**
     * Runs gpg without a shell and without blocking the event loop (the bot and the API share it).
     * @throws The process error, with gpg's stderr attached, if it fails or times out.
     */
    private static gpg(args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            execFile('gpg', args, { timeout: SecurityService.GPG_TIMEOUT_MS }, (error, _stdout, stderr) => {
                if (error) reject(Object.assign(error, { stderr }));
                else resolve();
            });
        });
    }

    /**
     * Creates a detached ASCII-armored signature for a file using GPG.
     * Generates a new file with the same name plus a '.asc' extension in the same directory.
     * * @param {string} filePath - Absolute or relative path to the file to be signed.
     * @returns {Promise<void>}
     * @throws {Error} If the file does not exist at the provided path.
     * @throws {Error} If the GPG command fails (e.g., identity not found, binary missing).
     */
    public static async signFile(filePath: string): Promise<void> {
        if (!fs.existsSync(filePath)) throw new Error("File to sign not found");
        if (!this.GPG_IDENTITY) throw new Error("GPG_IDENTITY is not configured");

        try {
            await SecurityService.gpg([ '--batch', '--yes', '--local-user', this.GPG_IDENTITY, '--digest-algo', 'SHA256', '--set-filename', '', '--detach-sign', '--armor', filePath ]);
        } catch (error) {
            console.error("GPG Signing Error:", String((error as { stderr?: unknown }).stderr ?? error));
            throw new Error("Failed to sign package with GPG");
        }
    }

    /**
     * Verifies a file's integrity and authenticity against a detached GPG signature.
     * @param {string} filePath - Path to the original file.
     * @param {string} signaturePath - Path to the detached signature file.
     * @returns {Promise<boolean>} True if the signature is valid and matches the file, false otherwise.
     */
    public static async verifySignature(filePath: string, signaturePath: string): Promise<boolean> {
        if (!fs.existsSync(filePath) || !fs.existsSync(signaturePath)) return false;

        try {
            await SecurityService.gpg([ '--batch', '--verify', signaturePath, filePath ]);
            return true;
        } catch {
            return false;
        }
    }

    /** @returns {string} The hex-encoded SHA-256 of some bytes. */
    public static hash(content: Buffer): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }
}
