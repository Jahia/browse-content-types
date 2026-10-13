import {addNode} from '@jahia/cypress';

export const TEST_TEMPLATE_SET = 'browse-content-types-test-module';

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
