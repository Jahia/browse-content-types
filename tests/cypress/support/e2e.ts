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
 * NOT suppressing uncaught exceptions, deliberately - and this is a departure from jContent's own
 * suite, which returns false here.
 *
 * A render that throws out of this module is exactly the failure these tests exist to catch: the
 * route used to throw on mount against a jContent without the side-panel exports, and a swallowed
 * exception would have let that spec pass while the accordion was a blank pane. Stated rather than
 * left implicit, because the reflex on meeting a noisy suite is to add the suppression back.
 *
 * If jContent itself turns out to throw benign exceptions here, narrow this to the ones that do
 * not come from this module rather than silencing the lot.
 */

/*
 * One session per test, established before any spec's own hooks.
 *
 * Here rather than inside the navigation helper because `cy.session` clears cookies AND local
 * storage every time it runs: done per visit, it wipes whatever the screen under test had stored,
 * which is exactly what the columns picker keeps there.
 */
beforeEach(() => {
    cy.loginAndStoreSession();
});
