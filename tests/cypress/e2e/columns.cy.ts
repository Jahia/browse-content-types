import {createSite, deleteSite} from '@jahia/cypress';
import {closeColumnsPicker, columnEntry, columnKeyFor, openAccordion, openColumnsPicker, table} from '../support/contentTypes';
import {TEST_TEMPLATE_SET, addProduct, waitForRows} from '../support/fixtures';

/**
 * Choosing which columns a type's table shows, and that the choice survives leaving the screen.
 *
 * The choice is kept in localStorage, so this is also the suite covering the catalog rules a review
 * found two defects in - a key that two properties could share, and a stored value whose shape was
 * never checked.
 */
describe('Columns picker', () => {
    const SITE_KEY = 'bctColumns';
    const PRICE = columnKeyFor('bctnt:price');
    const TAGS = columnKeyFor('bctnt:tags');

    before(() => {
        createSite(SITE_KEY, {templateSet: TEST_TEMPLATE_SET, serverName: 'localhost', locale: 'en'});
        addProduct(SITE_KEY, {name: 'hammer', title: 'Hammer', price: 12.5});
        addProduct(SITE_KEY, {name: 'drill', title: 'Drill', price: 99.9});
    });

    after(() => {
        deleteSite(SITE_KEY);
    });

    beforeEach(() => {
        // Each test starts from the defaults rather than from whatever the last one chose: the
        // choice is deliberately persisted, which would make these order-dependent otherwise.
        cy.clearLocalStorage();
    });

    it('offers the properties the type declares itself', () => {
        openAccordion(SITE_KEY, 'bctnt:product');
        waitForRows(2);

        openColumnsPicker();
        columnEntry(PRICE).should('exist');
        columnEntry(TAGS).should('exist');
    });

    it('draws a column once it is ticked', () => {
        openAccordion(SITE_KEY, 'bctnt:product');
        waitForRows(2);

        openColumnsPicker();
        columnEntry(PRICE).click();
        closeColumnsPicker();

        // The value, not just the header: a column whose accessor reads undefined would still
        // render a header and prove nothing.
        table().should('contain.text', '99.9');
    });

    it('remembers the choice after leaving the screen and coming back', () => {
        openAccordion(SITE_KEY, 'bctnt:product');
        waitForRows(2);

        openColumnsPicker();
        columnEntry(PRICE).click();
        closeColumnsPicker();
        table().should('contain.text', '99.9');

        openAccordion(SITE_KEY, 'bctnt:product');
        waitForRows(2);
        table().should('contain.text', '99.9');
    });

    it('gives the defaults back on reset', () => {
        openAccordion(SITE_KEY, 'bctnt:product');
        waitForRows(2);

        openColumnsPicker();
        columnEntry(PRICE).click();
        closeColumnsPicker();
        table().should('contain.text', '99.9');

        openColumnsPicker();
        cy.get('[data-sel-role="columns-reset"]').click();
        closeColumnsPicker();
        table().should('not.contain.text', '99.9');
    });

    /*
     * The stored choice is read back and mapped through the server's catalog. A value that parses
     * but is not a list of keys used to reach a `map` during render, which blanked the pane - and
     * kept blanking it on every visit, because the bad value stayed in storage and the control that
     * clears it sits behind the component that crashed.
     */
    it('falls back to the defaults when the stored choice is not a list', () => {
        cy.visit('/jahia/jcontent');
        cy.window().then(win => {
            win.localStorage.setItem('content-types:columns:' + SITE_KEY + ':bctnt:product', '{"not":"a list"}');
        });

        openAccordion(SITE_KEY, 'bctnt:product');

        // That the table renders at all is the claim. A blank pane fails here.
        waitForRows(2);
        table().should('be.visible');
    });

    it('survives a stored choice naming a column that no longer exists', () => {
        cy.visit('/jahia/jcontent');
        cy.window().then(win => {
            win.localStorage.setItem(
                'content-types:columns:' + SITE_KEY + ':bctnt:product',
                JSON.stringify(['ct_gone_58_missing', 'lastModified'])
            );
        });

        openAccordion(SITE_KEY, 'bctnt:product');
        waitForRows(2);
        cy.get('[data-sel-role="content-error"]').should('not.exist');
    });
});
