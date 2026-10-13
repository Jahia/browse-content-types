import {defineConfig} from 'cypress';

export default defineConfig({
    chromeWebSecurity: false,
    // jContent is a single page app behind a federated bundle: the first navigation of a run
    // pays for loading the whole shell, so the default 4s is not a realistic budget here.
    defaultCommandTimeout: 20000,
    pageLoadTimeout: 60000,
    requestTimeout: 60000,
    responseTimeout: 60000,
    reporter: 'cypress-multi-reporters',
    reporterOptions: {
        configFile: 'reporter-config.json'
    },
    screenshotsFolder: './results/screenshots',
    video: true,
    videosFolder: './results/videos',
    viewportWidth: 1366,
    viewportHeight: 768,
    watchForFileChanges: false,
    e2e: {
        specPattern: ['**/*.cy.ts'],
        supportFile: 'cypress/support/e2e.ts',
        setupNodeEvents(on, config) {
            // Delegated to a plain JS file rather than required here: this config is TypeScript and
            // Cypress bundles it with webpack before running it, which resolves an inlined deep
            // require at bundle time.
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            return require('./cypress/plugins/index.js')(on, config);
        }
    }
});
