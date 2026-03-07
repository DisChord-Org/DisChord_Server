class Runtime {
    public static runtime: 'dev' | 'prod' = 'prod';

    constructor () {
        const args = process.argv.slice(2);

        if (args.length > 0 && args[0] === '--dev') Runtime.runtime = 'dev';
    }
}

new Runtime();

export = Runtime.runtime;