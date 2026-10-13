import '@jahia/cypress/dist/support/support';
import registerCypressGrep from 'cypress-terminal-report/src/installLogsCollector';

registerCypressGrep({
    collectTypes: ['cons:log', 'cons:error', 'cons:warn', 'cy:request', 'cy:command'],
    enableExtendedCollector: true
});

// A failing render inside jContent is an uncaught exception from a federated bundle this suite does
// not own, and Cypress fails the test on it by default. That is the behaviour wanted - a crash in
// the accordion IS the failure these tests exist to catch - so nothing is swallowed here. Stated
// rather than left implicit, because the reflex on seeing a flaky suite is to add the suppression.
