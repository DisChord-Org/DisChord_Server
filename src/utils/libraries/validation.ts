/** Package names become folder names, URL segments and registry keys. */
const PackageNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** `owner/repo` as GitHub writes it; it is interpolated into API URLs, so nothing else may get through. */
const GithubRepoPattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;

export function isValidPackageName(name: unknown): name is string {
    return typeof name === 'string' && PackageNamePattern.test(name);
}

export function isValidGithubRepo(githubUrl: unknown): githubUrl is string {
    if (typeof githubUrl !== 'string' || !GithubRepoPattern.test(githubUrl)) return false;

    const repo = githubUrl.split('/')[1];
    return repo !== '.' && repo !== '..';
}

/** @throws {Error} If the value is not an `owner/repo` identifier. */
export function assertGithubRepo(githubUrl: unknown): string {
    if (!isValidGithubRepo(githubUrl)) throw new Error(`Repositorio de GitHub no válido: '${String(githubUrl)}'. Usa el formato owner/repo.`);

    return githubUrl;
}
