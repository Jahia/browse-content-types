import {createSite, deleteSite} from '@jahia/cypress';
import {clearSearch, openAccordion, rowFor, search} from '../support/contentTypes';
import {TEST_TEMPLATE_SET, addProduct, waitForRows} from '../support/fixtures';

/** Narrowing a listing by what was typed. */
describe('Searching within a type', () => {
    const SITE_KEY = 'bctSearch';

    before(() => {
        createSite(SITE_KEY, {templateSet: TEST_TEMPLATE_SET, serverName: 'localhost', locale: 'en'});
        addProduct(SITE_KEY, {name: 'hammer', title: 'Hammer', price: 12.5});
        addProduct(SITE_KEY, {name: 'wrench', title: 'Wrench', price: 8});
        addProduct(SITE_KEY, {name: 'screwdriver', title: 'Screwdriver', price: 5});
    });

    after(() => {
        deleteSite(SITE_KEY);
    });

    it('narrows the listing to what matches', () => {
        openAccordion(SITE_KEY, 'bctnt:product');
        waitForRows(3);

        search('Hammer');
        waitForRows(1);
        rowFor(`/sites/${SITE_KEY}/contents/hammer`).should('exist');
    });

    it('matches a fragment from the middle of a word', () => {
        openAccordion(SITE_KEY, 'bctnt:product');
        waitForRows(3);

        // The arm that exists for exactly this: the full text match is whole-word-or-prefix, so
        // without the LIKE arms "crewdriv" would find nothing.
        search('crewdriv');
        waitForRows(1);
        rowFor(`/sites/${SITE_KEY}/contents/screwdriver`).should('exist');
    });

    /*
     * `_` is a single-character wildcard in a JCR-SQL2 LIKE. It is escaped out of the term, so this
     * finds nothing rather than quietly matching "Hammer" the way `H_mmer` otherwise would.
     */
    it('treats an underscore as a character to look for, not as a wildcard', () => {
        openAccordion(SITE_KEY, 'bctnt:product');
        waitForRows(3);

        search('H_mmer');
        cy.get('[data-sel-role="content-row"]').should('have.length', 0);
    });

    it('says a term is too short rather than leaving the table unexplained', () => {
        openAccordion(SITE_KEY, 'bctnt:product');
        waitForRows(3);

        search('ham');
        cy.get('[data-sel-role="search-too-short"]').should('be.visible');
    });

    it('restores the full listing when the term is cleared', () => {
        openAccordion(SITE_KEY, 'bctnt:product');
        waitForRows(3);

        search('Hammer');
        waitForRows(1);

        clearSearch();
        waitForRows(3);
    });
});
