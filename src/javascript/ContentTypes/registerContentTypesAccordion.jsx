import React from 'react';
import {registry} from '@jahia/ui-extender';
import {AccordionItem, Grain} from '@jahia/moonstone';
import {ContentTypesTree} from './ContentTypesTree';
import {ContentTypesRoute} from './ContentTypesRoute';
import {NAMESPACE} from '../ContentTypes.register';

/** Identifies the accordion in jContent's registry, and names its segment in the URL. */
export const ACCORDION_KEY = 'contentTypes';

const registerContentTypesAccordion = () => {
    const renderDefaultContentTrees = registry.get('accordionItem', 'renderDefaultContentTrees');

    // The callback this runs from can fire more than once in a session; registering the same key
    // twice would replace a live accordion while jContent is rendering it.
    if (registry.get('accordionItem', ACCORDION_KEY)) {
        return;
    }

    registry.add('accordionItem', ACCORDION_KEY, renderDefaultContentTrees, {
        targets: ['jcontent:75'],
        icon: <Grain/>,
        label: `${NAMESPACE}:label.accordion`,
        isEnabled: siteKey => siteKey !== 'systemsite',
        requireModuleInstalledOnSite: 'browse-content-types',

        // What lets an administrator take this accordion away from a role, the way they can take
        // away pages or media. jContent shows an accordion that declares no permission to
        // everyone - see the filter in its ContentNavigation - so without this, revoking the
        // content tree from a role left the same browsing reachable through here.
        requiredSitePermission: 'contentTypesAccordionAccess',

        // What this accordion selects is a node type, not a node, so its path is '/<typeName>'
        // and '/' means nothing is selected yet. The base accordion's helpers assume a JCR path
        // and reset anything not under /sites/<site>, which would discard the type on every
        // navigation, so all four are replaced here.
        rootPath: '/',
        getRootPath: () => '/',
        getPath: (site, pathElements) => '/' + pathElements.join('/'),
        getUrlPathPart: (site, path) => path,

        render: v => (
            <AccordionItem key={v.id} {...v}>
                <ContentTypesTree/>
            </AccordionItem>
        ),

        /*
         * Refused as a target for "open in jContent" and anything else that locates a node.
         *
         * The base supplies a `getPathForItem` that answers with a JCR path, which means nothing
         * for an accordion whose paths are `/<typeName>`. Every caller happens to check
         * `canDisplayItem` first, so today it is never reached - but that is jContent's business
         * rather than a promise to this module, and saying no outright is what makes the exclusion
         * the decision it already is.
         */
        canDisplayItem: () => false,

        /*
         * Overriding routeComponent rather than routeRender: jContent prefers routeComponent when
         * both are set, and the base accordion already supplies one, so setting routeRender here
         * would simply be ignored.
         *
         * Note what the registry does with it. `composeServices` merges by VALUE: an object
         * replaces the base's wholesale - which is why neither `treeConfig` nor `tableConfig` is
         * set here, since setting either would silently drop the queryHandler and selectableTypes
         * the base supplies - while a function is WRAPPED, called with the base's own version
         * appended as a trailing argument. So what jContent ends up holding is an anonymous
         * wrapper around this component rather than this component itself. Harmless, since the
         * extra argument is ignored, but it is why the route shows as anonymous in the devtools -
         * and it would stop working if this were ever wrapped in React.memo or forwardRef, which
         * are objects and would take the replace path instead.
         */
        routeComponent: ContentTypesRoute
    });
};

export default registerContentTypesAccordion;
