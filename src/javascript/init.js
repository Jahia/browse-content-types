import {registry} from '@jahia/ui-extender';
import register from './ContentTypes.register';

export default function () {
    // The accordion goes into jContent's registry, which only exists once jContent has
    // initialised. jContent registers its own accordions on jahiaApp-init:1, so this runs after.
    registry.add('callback', 'contentTypes', {
        targets: ['jahiaApp-init:60'],
        callback: register
    });
}
