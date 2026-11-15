/** Variables the server needs, and what stops working without each one. */
const expected: Record<string, string> = {
    BOT_TOKEN: 'el bot de Discord no puede iniciar sesión',
    INTERNAL_SECRET: '/internal/ssh-login y /versions/update responden 403',
    GITHUB_TOKEN: 'las versiones de los componentes se piden a GitHub sin autenticar',
    GITHUB_LIBRARIES_TOKEN: 'las releases de los paquetes se piden a GitHub sin autenticar',
    GPG_IDENTITY: 'no se puede firmar ningún paquete'
};

/**
 * Reports every missing variable at startup, so a bad deployment is noticed immediately
 * instead of surfacing later as an unrelated error.
 * @returns The names of the missing variables.
 */
export function checkEnvironment(env: NodeJS.ProcessEnv = process.env): string[] {
    const missing = Object.keys(expected).filter(name => !env[name]);

    for (const name of missing) console.warn(`[config] Falta ${name}: ${expected[name]}.`);

    return missing;
}
