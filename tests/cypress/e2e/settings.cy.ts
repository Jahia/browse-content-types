import {deleteSite} from '@jahia/cypress';
import {openAccordion, typeItem, leaveJContent} from '../support/contentTypes';
import {addProduct, createTestSite} from '../support/fixtures';

/**
 * The administrator's choice of which types the accordion lists.
 *
 * Stored on the site node, so it is the one setting here that changes what a colleague sees - and
 * the one the accordion reads on every open. The race it covers is real: the type list and the
 * stored choice are two queries, and the accordion used to navigate to a type the choice excluded
 * whenever the first answered from cache while the second was still in flight.
 */
describe('Choosing which types are listed', () => {
    const SITE_KEY = 'bctsettings';
    const sitePath = '/sites/' + SITE_KEY;

    /*
     * Opened on a named type rather than on the accordion root.
     *
     * `/contentTypes` with no type leaves jContent to resolve where to land, and on a site created
     * moments earlier it intermittently resolves somewhere else entirely - the accordion never
     * draws and the spec fails on a screen it never reached. A complete path is deterministic, and
     * what these tests are about is which types the TREE lists, which is independent of the one
     * the main pane happens to be showing. `bctnt:product` stays listed under every choice made
     * below, so it is a stable place to stand.
     */
    const LANDING_TYPE = 'bctnt:product';

    before(() => {
        createTestSite(SITE_KEY);
        addProduct(SITE_KEY, {name: 'hammer', title: 'Hammer', price: 12.5});
    });

    after(() => {
        leaveJContent();
        deleteSite(SITE_KEY);
    });

    it('lists every editorial type when no choice has been made', () => {
        openAccordion(SITE_KEY, LANDING_TYPE);
        typeItem('bctnt:product').should('exist');
        typeItem('bctnt:supplier').should('exist');
    });

    it('narrows the accordion to the chosen types, and holds on reopen', () => {
        // Through the GraphQL the settings panel itself uses rather than by driving the admin UI:
        // what is under test here is that the ACCORDION honours the choice.
        cy.apollo({
            mutationFile: 'graphql/setListedTypes.graphql',
            variables: {sitePath, types: ['bctnt:product']}
        });

        openAccordion(SITE_KEY, LANDING_TYPE);
        typeItem('bctnt:product').should('exist');
        typeItem('bctnt:supplier').should('not.exist');

        /*
         * Reopened, because the first open is not where this broke. The type list is issued by more
         * than one component, so on a SECOND open it answers from Apollo's cache while the stored
         * choice is still loading - and the accordion would navigate to a type the administrator had
         * just removed, leaving the main pane on a type the tree has no row to leave it by.
         */
        openAccordion(SITE_KEY, LANDING_TYPE);
        typeItem('bctnt:supplier').should('not.exist');
        cy.url().should('not.contain', 'supplier');
    });

    it('reads an empty choice as "list everything" rather than "list nothing"', () => {
        cy.apollo({
            mutationFile: 'graphql/setListedTypes.graphql',
            variables: {sitePath, types: []}
        });

        openAccordion(SITE_KEY, LANDING_TYPE);
        typeItem('bctnt:product').should('exist');
        typeItem('bctnt:supplier').should('exist');
    });
});
