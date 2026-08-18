import pkg from '../../package.json';

/**
 * The app version shown in the Sidebar brand header. Read from package.json
 * at build time so the UI can never drift from the released version.
 */
export const APP_VERSION: string = pkg.version;
