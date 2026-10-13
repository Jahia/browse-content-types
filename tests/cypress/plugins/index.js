/// <reference types="cypress" />

/**
 * Node-side plugin registration.
 *
 * A plain JS file that the config delegates to, which is how jContent's own suite does it - and not
 * only for symmetry: the config is a .ts file that Cypress bundles with webpack before running it,
 * and a deep `require` inlined there is resolved at bundle time rather than at run time.
 *
 * @type {Cypress.PluginConfig}
 */
module.exports = (on, config) => {
    // A log task, so a probe can write to the runner's stdout rather than into the browser console.
    on('task', {log(message) { console.log(message); return null; }});

    // Reads JAHIA_URL / SUPER_USER_PASSWORD from the environment and sets Cypress's baseUrl and env
    // from them, so no file here names an instance.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@jahia/cypress/dist/plugins/registerPlugins').registerPlugins(on, config);

    // The printer half of cypress-terminal-report; the collector half is registered in support/e2e.
    // Both halves are needed - a collector with no printer gathers logs nothing ever writes out.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('cypress-terminal-report/src/installLogsPrinter')(on, {
        printLogsToConsole: 'onFail',
        printLogsToFile: 'onFail',
        outputRoot: config.projectRoot + '/results/',
        specRoot: 'cypress/e2e',
        outputTarget: {'cypress-logs|txt': 'txt'}
    });

    return config;
};
