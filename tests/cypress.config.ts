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
            // Reads JAHIA_URL / SUPER_USER_PASSWORD from the environment and sets baseUrl + env
            // from them, so a run points at an instance without this file naming one.
            require('@jahia/cypress/dist/plugins/registerPlugins').registerPlugins(on, config);
            return config;
        }
    }
});
