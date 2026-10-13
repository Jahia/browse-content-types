import {addNode, createSite} from '@jahia/cypress';

export const TEST_TEMPLATE_SET = 'browse-content-types-test-module';

/**
 * **Site keys here are lower case, and that is load-bearing.**
 *
 * A key with an upper-case letter creates a site that looks entirely healthy - the node is there,
 * the template set is right, the modules are installed - but jContent will not open an accordion
 * on it, so every spec using it fails on the route never rendering and reads as the module being
 * broken. Measured: the same spec is 0/5 as `bctSearch` and 5/5 as `bctsearch`.
 */

/**
 * The suite's site.
 *
 * **`localhost` as the server name, for every site.** Giving each site a name of its own looks
 * tidier and is worse: measured, the same spec goes from 2/6 to 0/6, because the accordion then
 * never opens on it. Jahia resolves the app shell through the server name, and a name nothing
 * answers for is not a cosmetic detail. The sites here are created and deleted one at a time, so
 * sharing the name costs nothing.
 */
export const createTestSite = (siteKey: string) =>
    createSite(siteKey, {templateSet: TEST_TEMPLATE_SET, serverName: 'localhost', locale: 'en'});

/**
 * A folder of products, planted in the site's own contents.
 *
 * In the site's language and with the mandatory i18n property set, because the listing selects
 * against the translation node for the render locale: a node planted without one is filtered out
 * of the query and the table renders empty, which would make every assertion below pass for the
 * wrong reason.
 */
export const addProduct = (
    siteKey: string,
    {name, title, price, category = 'tools'}: {name: string; title: string; price: number; category?: string}
) =>
    addNode({
        parentPathOrId: `/sites/${siteKey}/contents`,
        primaryNodeType: 'bctnt:product',
        name,
        properties: [
            {name: 'jcr:title', value: title, language: 'en'},
            {name: 'bctnt:price', value: String(price)},
            {name: 'bctnt:category', value: category},
            {name: 'bctnt:summary', value: `${title} summary`, language: 'en'}
        ]
    });

export const addSupplier = (
    siteKey: string,
    {name, title, country = 'FR'}: {name: string; title: string; country?: string}
) =>
    addNode({
        parentPathOrId: `/sites/${siteKey}/contents`,
        primaryNodeType: 'bctnt:supplier',
        name,
        properties: [
            {name: 'jcr:title', value: title, language: 'en'},
            {name: 'bctnt:country', value: country}
        ]
    });

/**
 * Retries until the table reports the expected number of rows.
 *
 * The listing is a JCR-SQL2 query against Oak's ASYNC index, which lags a just-saved node by a few
 * seconds. Asserting on the first render is the classic false red here - and a query issued inside
 * the planting session sees the node immediately, which is what makes the lag easy to miss.
 */
export const waitForRows = (expected: number) =>
    cy.get('[data-sel-role="content-row"]', {timeout: 60000}).should('have.length', expected);
