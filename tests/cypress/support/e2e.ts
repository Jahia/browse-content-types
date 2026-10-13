// eslint-disable-next-line @typescript-eslint/no-require-imports
require('cypress-terminal-report/src/installLogsCollector')({
    collectTypes: ['cons:log', 'cons:info', 'cons:warn', 'cons:error', 'cy:log', 'cy:request', 'cy:command'],
    enableExtendedCollector: true
});

// Registers @jahia/cypress's own commands - cy.apollo, cy.login, cy.executeGroovy and the rest.
// Without it every helper this suite imports resolves to undefined at run time.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('@jahia/cypress/dist/support/registerSupport').registerSupport();

/*
 * Uncaught exceptions fail a test when they come from THIS module, and not when they come from
 * jContent's own bundle.
 *
 * The blanket `return false` that most suites use would hide the single most valuable signal here:
 * the route used to throw on mount against a jContent without the side-panel exports, and a
 * swallowed exception would have let that spec pass while the accordion was a blank pane. So
 * anything attributable to browse-content-types still fails.
 *
 * jContent's own bundle is a different matter. Tearing a site down, or logging out, while the app
 * is still mounted leaves it querying what has just gone, and it throws on a result it does not
 * guard - `Cannot read properties of undefined (reading 'contentTypesAsTree')` out of
 * modules/jcontent/javascript/apps/*. Every read of that field in THIS module is optional-chained,
 * so the unguarded one is jContent's; it is worth reporting upstream, and it is not a reason for
 * this suite to be red.
 *
 * Anything that cannot be attributed to either still fails, so a new crash is never silent.
 */
Cypress.on('uncaught:exception', err => {
    const fromJContent = /modules\/jcontent\/javascript\/apps\//.test(err.stack || '');
    const fromThisModule = /modules\/browse-content-types\//.test(err.stack || '');

    return !(fromJContent && !fromThisModule);
});

beforeEach(() => {
    cy.loginAndStoreSession();
});
