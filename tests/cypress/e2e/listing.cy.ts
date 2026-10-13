import {deleteSite} from '@jahia/cypress';
import {openAccordion, rows, rowFor, selectType, table} from '../support/contentTypes';
import {addProduct, addSupplier, createTestSite, waitForRows} from '../support/fixtures';

/**
 * The listing itself: picking a type shows every record of it, and only of it.
 *
 * The point the module exists for, so this is the suite that says whether it works at all.
 */
describe('Listing records of a type', () => {
    const SITE_KEY = 'bctlisting';

    before(() => {
        createTestSite(SITE_KEY);
        addProduct(SITE_KEY, {name: 'hammer', title: 'Hammer', price: 12.5});
        addProduct(SITE_KEY, {name: 'wrench', title: 'Wrench', price: 8});
        addProduct(SITE_KEY, {name: 'drill', title: 'Drill', price: 99.9, category: 'parts'});
        addSupplier(SITE_KEY, {name: 'acme', title: 'Acme Supplies'});
    });

    after(() => {
        deleteSite(SITE_KEY);
    });

    it('lists every record of the selected type', () => {
        openAccordion(SITE_KEY, 'bctnt:product');
        waitForRows(3);

        rowFor(`/sites/${SITE_KEY}/contents/hammer`).should('exist');
        rowFor(`/sites/${SITE_KEY}/contents/wrench`).should('exist');
        rowFor(`/sites/${SITE_KEY}/contents/drill`).should('exist');
    });

    /*
     * The other half of the same claim, and the one that would fail silently: a listing that showed
     * everything would pass the assertion above and still be wrong.
     */
    it('lists records of that type ONLY', () => {
        openAccordion(SITE_KEY, 'bctnt:product');
        waitForRows(3);

        rowFor(`/sites/${SITE_KEY}/contents/acme`).should('not.exist');
    });

    it('switches the listing when another type is selected', () => {
        openAccordion(SITE_KEY, 'bctnt:product');
        waitForRows(3);

        selectType('bctnt:supplier');
        waitForRows(1);
        rowFor(`/sites/${SITE_KEY}/contents/acme`).should('exist');
    });

    it('says so, rather than erroring, for a type with no records', () => {
        openAccordion(SITE_KEY, 'bctnt:supplier');
        waitForRows(1);

        // Nothing here should ever be the error state - an empty type is an ordinary answer.
        cy.get('[data-sel-role="content-error"]').should('not.exist');
    });

    it('draws the record title the type declares as its primary item', () => {
        openAccordion(SITE_KEY, 'bctnt:product');
        waitForRows(3);

        table().should('contain.text', 'Hammer');
        table().should('contain.text', 'Drill');
    });

    it('never leaves the table in its error state on a healthy listing', () => {
        openAccordion(SITE_KEY, 'bctnt:product');
        waitForRows(3);

        // The record query declares $language non-null, and used to be issued before the store had
        // one - which replaced the table with this message for a render.
        cy.get('[data-sel-role="content-error"]').should('not.exist');
        rows().should('have.length', 3);
    });
});
