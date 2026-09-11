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

        // Overriding routeComponent rather than routeRender: jContent prefers routeComponent when
        // both are set, and the base accordion already supplies one, so setting routeRender here
        // would simply be ignored.
        routeComponent: ContentTypesRoute
    });
};

export default registerContentTypesAccordion;
