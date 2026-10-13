import {createSite, deleteSite, createUser, deleteUser, grantRoles} from '@jahia/cypress';
import {openAccordion, tree, typeItem} from '../support/contentTypes';
import {TEST_TEMPLATE_SET} from '../support/fixtures';

/**
 * That the accordion is there at all, for the people who should see it and not for the others.
 *
 * This is the suite that would have caught two of the defects a review found: the route threw on
 * mount against a jContent without the side-panel exports, and the accordion declared no
 * permission so revoking content access left it reachable anyway. Neither is visible to a unit
 * test - the first needs a real federated jContent, the second a real role.
 */
describe('Content Types accordion', () => {
    const SITE_KEY = 'bctAccordion';

    before(() => {
        createSite(SITE_KEY, {templateSet: TEST_TEMPLATE_SET, serverName: 'localhost', locale: 'en'});
    });

    after(() => {
        deleteSite(SITE_KEY);
    });

    it('renders without throwing, and lists the site editorial types', () => {
        // The assertion is the render itself. An uncaught exception out of the module fails the
        // test, which is the whole point: the route used to dispatch a federated action that a
        // jContent without the export answers with undefined.
        openAccordion(SITE_KEY);
        tree().should('be.visible');

        typeItem('bctnt:product').should('exist');
        typeItem('bctnt:supplier').should('exist');
    });

    it('opens on its first type rather than on nothing', () => {
        openAccordion(SITE_KEY);

        // Whichever type sorts first by display name - the point is that SOMETHING is selected and
        // the main pane is not left blank, not which one won.
        cy.get('[data-sel-role="content-types-table"], [data-sel-role="content-empty"]')
            .should('exist');
        cy.url().should('match', /\/contentTypes\/bctnt%3A|\/contentTypes\/bctnt:/);
    });

    describe('permission gating', () => {
        const EDITOR = 'bct-editor';
        const OUTSIDER = 'bct-outsider';

        before(() => {
            createUser(EDITOR, 'password');
            createUser(OUTSIDER, 'password');
            // The editor gets the role that carries contentTypesAccordionAccess; the outsider gets
            // a role on the site that does not.
            grantRoles(`/sites/${SITE_KEY}`, ['editor'], EDITOR, 'USER');
            grantRoles(`/sites/${SITE_KEY}`, ['reader'], OUTSIDER, 'USER');
        });

        after(() => {
            deleteUser(EDITOR);
            deleteUser(OUTSIDER);
        });

        it('shows the accordion to a role that holds the permission', () => {
            cy.login(EDITOR, 'password');
            cy.visit(`/jahia/jcontent/${SITE_KEY}/en/contentTypes`);
            cy.get('[data-sel-role="content-types-route"]', {timeout: 60000}).should('exist');
            cy.logout();
        });

        /*
         * The negative, and the reason it is written against a user who CAN reach jContent rather
         * than one who cannot reach anything: an assertion that something is absent passes for free
         * when the page never loaded. jContent itself has to be on screen for "and not this
         * accordion" to mean anything, so that is asserted first.
         */
        it('hides it from a role that does not', () => {
            cy.login(OUTSIDER, 'password');
            cy.visit(`/jahia/jcontent/${SITE_KEY}/en/pages`, {failOnStatusCode: false});

            cy.get('[data-sel-role="jcontent"], #jcontent, [data-sel-role="accordion-item"]', {timeout: 60000})
                .should('exist');
            cy.get('[data-sel-role="content-types-route"]').should('not.exist');
            cy.logout();
        });
    });
});
