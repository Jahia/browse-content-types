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
    // No login here, deliberately. `cy.session` - which `loginAndStoreSession` uses - CLEARS
    // localStorage each time it runs, and localStorage is where the column choice is kept. Calling
    // it per navigation meant a test that opened the screen twice erased the very thing it went on
    // to assert, and read as the module forgetting the choice. The session is established once per
    // test in the global beforeEach instead.
    cy.visit(accordionUrl(siteKey, typeName));

    /*
     * Reloaded if the accordion does not come up, rather than waited on harder.
     *
     * This screen is a federated bundle inside a single page app, reached on a site created moments
     * earlier: the registry entry, the site's module list and jContent's own start-up all have to
     * line up, and intermittently the first load lands before they do. The screen then stays empty
     * for as long as anything waits on it - no error, nothing to retry at the assertion level -
     * while a reload comes up correctly.
     *
     * Bounded at two further attempts, so a module that is genuinely broken still fails rather than
     * being hidden by a loop. The timeouts are short because the question is only whether THIS load
     * worked; a real one answers in a couple of seconds.
     */
    const attempt = (left: number) => {
        cy.get('body', {timeout: 30000}).then($body => {
            if ($body.find('[data-sel-role="content-types-route"]').length > 0 || left === 0) {
                return;
            }

            cy.reload();
            attempt(left - 1);
        });
    };

    attempt(2);

    cy.get('[data-sel-role="content-types-route"]', {timeout: 60000}).should('exist');

    // The tree draws a loader until a type is selected, and opening on '/' selects one by
    // navigating - so the route existing is not yet a settled screen. Waiting for the tree or its
    // empty message is what makes a caller's first assertion land on the real thing.
    return cy.get('[data-sel-role="content-types-tree"], [data-sel-role="no-types"]', {timeout: 60000})
        .should('exist');
};

/**
 * The accordion's own entry in jContent's left navigation.
 *
 * Moonstone draws each accordion as a section whose header is keyed by the registry key, so this is
 * what `requiredSitePermission` actually governs - jContent filters the ENTRY out, it does not
 * refuse the route. A permission test has to look here rather than at the route.
 */
export const accordionEntry = () =>
    cy.get('section.moonstone-accordionItem header[aria-controls="contentTypes"]');

/** Any accordion at all, as proof that jContent itself drew - see the negative permission test. */
export const anyAccordionEntry = () => cy.get('section.moonstone-accordionItem');

/**
 * Leaves jContent before the site it is showing is deleted.
 *
 * Deleting a site out from under the running app is not a quiet operation: jContent keeps polling
 * the site it still thinks it is on, its queries start answering PathNotFoundException, and its own
 * bundle then throws on a result it does not guard -
 * `Cannot read properties of undefined (reading 'contentTypesAsTree')`. That is jContent's to fix,
 * not this module's, but it fails the spec that happened to be unmounting at the time and it does
 * so in an `after` hook, which takes the rest of the file down with it.
 *
 * Navigating to a plain server-rendered page unmounts the app first, so there is nothing left
 * querying by the time the site goes.
 */
export const leaveJContent = () => cy.visit('/cms/login');

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

// Moonstone's SearchInput spreads its props onto the element rather than onto a wrapper, so the
// The attribute therefore sits on the input itself, and there is nothing to descend into.
const searchInput = () => cy.get('[data-sel-role="toolbar-search"]');

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

export const closeColumnsPicker = () => {
    /*
     * Dismissed through Moonstone's own overlay, not with Escape.
     *
     * The dropdown lays a full-screen `menu_overlay` over the page while it is open, and Escape
     * does not take it down. It stays, invisible, covering the very button that opens the picker -
     * so the NEXT attempt to open it fails with "covered by another element", pointing at the
     * toolbar button and saying nothing about the overlay that is actually in the way.
     */
    cy.get('body').then($body => {
        if ($body.find('.moonstone-menu_overlay').length > 0) {
            cy.get('.moonstone-menu_overlay').first().click({force: true});
        }
    });

    return cy.get('.moonstone-menu_overlay').should('not.exist');
};

export const columnEntry = (key: string) => cy.get(`[data-sel-column="${key}"]`);

/**
 * Ticks or unticks a column.
 *
 * Forced, because the attribute sits on Moonstone's checkbox `input`, which is visually hidden
 * behind its own styled box - Cypress refuses to click an element it computes as not visible, and
 * that is the control, not a decoration over it.
 */
export const toggleColumn = (key: string) => columnEntry(key).click({force: true});

/**
 * Back to the columns the table starts with.
 *
 * Forced for the same reason as the checkboxes: the control lives inside a dropdown that Moonstone
 * animates, and Cypress intermittently computes it as covered by its own container mid-transition.
 */
export const resetColumns = () => {
    // Asserted visible before the click, which is what makes Cypress re-query it. `force` alone
    // does not help here: the failure is a DETACHED element, not a covered one - the picker
    // re-renders as the ticked column is applied, so a reference taken a moment earlier is pointing
    // at a node that is no longer in the document by the time the click lands.
    cy.get('[data-sel-role="columns-reset"]').should('be.visible');
    return cy.get('[data-sel-role="columns-reset"]').click({force: true});
};

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
