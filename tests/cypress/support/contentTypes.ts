/**
 * Driving the Content Types accordion.
 *
 * Every selector here is a `data-sel-*` the module sets deliberately, never a class or a DOM shape:
 * the module's styling is Moonstone's and changes with it, while these attributes exist for exactly
 * this purpose. If a selector below stops matching, the module removed the hook - which is a change
 * worth failing on rather than one to chase with a cleverer selector.
 */

/** Where jContent puts this accordion. The last segment is the node TYPE, not a path. */
export const accordionUrl = (siteKey: string, typeName = '') =>
    `/jahia/jcontent/${siteKey}/en/contentTypes${typeName ? `/${typeName}` : ''}`;

/**
 * Opens the accordion and waits for it to have actually drawn.
 *
 * The route is what settles last - the tree can be on screen while the main pane is still
 * resolving its first type - so that is what is waited for rather than the URL changing.
 */
export const openAccordion = (siteKey: string, typeName?: string) => {
    cy.visit(accordionUrl(siteKey, typeName));
    return cy.get('[data-sel-role="content-types-route"]', {timeout: 60000}).should('exist');
};

export const tree = () => cy.get('[data-sel-role="content-types-tree"]');

export const typeItem = (typeName: string) =>
    cy.get(`[data-sel-content-type="${typeName}"]`);

export const selectType = (typeName: string) => {
    typeItem(typeName).click();
    return cy.get('[data-sel-role="content-types-table"]', {timeout: 60000}).should('be.visible');
};

export const table = () => cy.get('[data-sel-role="content-types-table"]');

export const rows = () => cy.get('[data-sel-role="content-row"]');

export const rowFor = (path: string) => cy.get(`[data-sel-path="${path}"]`);

export const toolbar = () => cy.get('[data-sel-role="content-types-toolbar"]');

const searchInput = () => cy.get('[data-sel-role="toolbar-search"]').find('input');

export const search = (term: string) => {
    // Split rather than chained: clear() is an action, and anything chained off it is working
    // against a subject Cypress may already have re-rendered out from under it.
    searchInput().clear();
    searchInput().type(term);
    return cy.get('[data-sel-role="toolbar-search"]');
};

export const clearSearch = () => searchInput().clear();

/** The picker is a dropdown: opening it is what mounts the list, so every column assertion needs it. */
export const openColumnsPicker = () => {
    cy.get('[data-sel-role="toolbar-columns"]').click();
    return cy.get('[data-sel-role="columns-picker"]').should('be.visible');
};

export const closeColumnsPicker = () => cy.get('body').type('{esc}');

export const columnEntry = (key: string) => cy.get(`[data-sel-column="${key}"]`);

/**
 * The key the module gives one of a type's own properties.
 *
 * Mirrors `columnKeyFor` in ContentTypesColumnCatalog - every character outside [a-zA-Z0-9] is
 * encoded as its code point - so a spec can name a column by the property it comes from rather
 * than by a string nobody can trace back.
 */
export const columnKeyFor = (propertyName: string) =>
    `ct_${propertyName.replace(/[^a-zA-Z0-9]/g, character => `_${character.charCodeAt(0)}_`)}`;

export const headerCell = (label: string) => table().contains('[role="columnheader"]', label);
