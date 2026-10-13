import {createUser, deleteSite, deleteUser, grantRoles} from '@jahia/cypress';
import {accordionEntry, anyAccordionEntry, openAccordion, tree, typeItem} from '../support/contentTypes';
import {createTestSite} from '../support/fixtures';

/**
 * That the accordion is there at all, for the people who should see it and not for the others.
 *
 * This is the suite that would have caught two of the defects a review found: the route threw on
 * mount against a jContent without the side-panel exports, and the accordion declared no permission
 * so revoking content access left it reachable anyway. Neither is visible to a unit test - the
 * first needs a real federated jContent, the second a real role.
 */
describe('Content Types accordion', () => {
    const SITE_KEY = 'bctaccordion';

    before(() => {
        createTestSite(SITE_KEY);
    });

    after(() => {
        deleteSite(SITE_KEY);
    });

    it('renders without throwing, and lists the types the site can hold', () => {
        // The assertion is the render itself. An uncaught exception out of the module fails the
        // test, which is the point: the route used to dispatch a federated action that a jContent
        // without the export answers with undefined.
        openAccordion(SITE_KEY);
        tree().should('be.visible');

        // The site's own types, among the editorial types Jahia itself ships - the tree lists both,
        // so this asserts ours are present rather than that they are all there is.
        typeItem('bctnt:product').should('exist');
        typeItem('bctnt:supplier').should('exist');
    });

    it('opens on a type rather than on nothing', () => {
        openAccordion(SITE_KEY);

        // WHICH type is not the claim - it is whichever sorts first by display name, and that
        // depends on what else is installed. The claim is that the main pane is not left blank.
        cy.url().should('match', /\/contentTypes\/[^/?]+/);
        cy.get('[data-sel-role="content-types-table"], [data-sel-role="content-empty"]').should('exist');
    });

    describe('permission gating', () => {
        const EDITOR = 'bct-editor';
        const ROLE_PATH = '/roles/editor';
        let granted: string[] = [];

        /*
         * These two need a SECOND editor, and that is a licensed resource.
         *
         * Jahia's free Discovery edition caps privileged users, and over the cap it does not refuse
         * the login - it serves jContent as a 503 licence page. Read naively that looks like the
         * accordion being hidden, which would make the negative test below pass for entirely the
         * wrong reason and the positive one fail as if the module were broken. So the ceiling is
         * probed once, and these are skipped with the reason said out loud rather than reported as
         * a result the instance cannot actually produce.
         */
        before(function () {
            createUser(EDITOR, 'password');
            grantRoles(`/sites/${SITE_KEY}`, ['editor'], EDITOR, 'USER');

            cy.login(EDITOR, 'password');
            cy.request({url: `/jahia/jcontent/${SITE_KEY}/en/pages`, failOnStatusCode: false})
                .then(response => {
                    cy.logout();
                    if (response.status === 503) {
                        cy.task('log',
                            'SKIPPED permission gating: this Jahia will not serve jContent to a second ' +
                            'editor (HTTP 503, licence page). Run against a licensed instance to cover it.');
                        this.skip();
                    }
                });
        });

        after(() => {
            // Restored here rather than at the end of the test that revokes it, so a failure midway
            // still gives the role back - this is global state that no site teardown covers.
            if (granted.length > 0) {
                cy.apollo({
                    mutationFile: 'graphql/setRolePermissions.graphql',
                    variables: {rolePath: ROLE_PATH, permissions: granted}
                });
            }

            deleteUser(EDITOR);
        });

        it('shows the accordion to a role that holds the permission', () => {
            cy.login(EDITOR, 'password');
            cy.visit(`/jahia/jcontent/${SITE_KEY}/en/pages`);
            accordionEntry().should('exist');
            cy.logout();
        });

        /*
         * The negative, done by taking the permission away rather than by using a different user.
         *
         * A user who simply cannot reach jContent proves nothing: the entry is absent because the
         * whole application is, which is the shape of assertion that passes for free. Revoking the
         * one permission from a role that otherwise still works isolates the gate itself - jContent
         * draws, its own accordions draw, and only ours is gone.
         */
        it('hides it once that permission is revoked', () => {
            cy.apollo({queryFile: 'graphql/getRolePermissions.graphql', variables: {rolePath: ROLE_PATH}})
                .then((result: any) => {
                    granted = result?.data?.jcr?.nodeByPath?.permissions?.values || [];
                    expect(granted, 'the editor role must hold it for this test to mean anything')
                        .to.include('contentTypesAccordionAccess');

                    cy.apollo({
                        mutationFile: 'graphql/setRolePermissions.graphql',
                        variables: {
                            rolePath: ROLE_PATH,
                            permissions: granted.filter(p => p !== 'contentTypesAccordionAccess')
                        }
                    });
                });

            cy.login(EDITOR, 'password');
            cy.visit(`/jahia/jcontent/${SITE_KEY}/en/pages`);

            // The jContent shell has to have drawn for "and not ours" to mean anything.
            anyAccordionEntry().should('exist');

            /*
             * Reloaded a few times before the assertion rather than asserted straight away. A
             * role's permissions are resolved per session and cached server-side, so the revoke
             * above is not necessarily visible to the very next request even on a fresh login -
             * and a bare assertion here would read that lag as the gate not working. Bounded, so a
             * gate that genuinely does not work still fails rather than hanging.
             */
            Cypress._.times(3, () => {
                cy.reload();
                // Paced on purpose: there is no client-side signal for a server-side cache catching up.
                // eslint-disable-next-line cypress/no-unnecessary-waiting
                cy.wait(1500);
            });

            accordionEntry().should('not.exist');
            cy.logout();
        });
    });
});
