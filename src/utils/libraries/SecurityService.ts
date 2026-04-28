import { execSync } from 'child_process';
import fs from 'fs';
import crypto from 'crypto';

/**
 * Handles digital signatures using GPG.
 * Ensures package authenticity and integrity.
 */
export class SecurityService {
    private static readonly GPG_IDENTITY = process.env.GPG_IDENTITY;

    /**
     * Creates a detached signature for a file.
     * Generates a {filename}.sig file.
     * @param filePath Path to the file to sign.
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
     * Verifies a file against its detached signature.
     * @param filePath Path to the original file (ZIP).
     * @param signaturePath Path to the .asc or .sig file.
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
     * Returns the ASCII Armor signature content as a string.
     */
    public static getSignatureContent(filePath: string): string | null {
        const sigPath = `${filePath}.asc`;
        return fs.existsSync(sigPath) ? fs.readFileSync(sigPath, 'utf-8') : null;
    }

    public static getFileHash(filePath: string): string {
        const fileBuffer = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(fileBuffer).digest('hex');
    }
}
