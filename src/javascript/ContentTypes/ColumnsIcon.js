import {toIconComponentFunction} from '@jahia/moonstone';

/**
 * The "add column" icon, from SVG Repo (svgrepo.com).
 *
 * Built through Moonstone so it is sized and coloured like every other icon in the interface. The
 * source file's 800px dimensions and black fill are replaced for that reason: 24px matches the
 * other icons, and currentColor lets this one follow the theme.
 *
 * toIconComponentFunction, not toIconComponent: the latter returns an element, so rendering it as
 * <ColumnsIcon/> asks React to treat an object as a component type and throws (React error #130).
 */
export const ColumnsIcon = toIconComponentFunction(
    '<svg style="width:24px;height:24px" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">' +
    '<path fill="currentColor" d="M42,22h-4v-4c0-0.5-0.2-1.1-0.6-1.4C37,16.2,36.5,16,36,16c-1.1,0-2,0.9-2,2v4h-4' +
    'c-0.5,0-1,0.2-1.4,0.6C28.2,22.9,28,23.5,28,24c0,1.1,0.9,2,2,2h4v4c0,0.5,0.2,1.1,0.6,1.4C35,31.8,35.5,32,36,32' +
    'c1.1,0,2-0.9,2-2v-4h4c0.5,0,1-0.2,1.4-0.6c0.4-0.3,0.6-0.9,0.6-1.4C44,22.9,43.1,22,42,22z M36,36c-1.1,0-2,0.9-2,2v2H24V8h10v2' +
    'c0,1.1,0.9,2,2,2s2-0.9,2-2V7c0.1-1.6-1.2-2.9-2.8-3c-0.1,0-0.1,0-0.2,0H9C7.4,3.9,6.1,5.2,6,6.8C6,6.9,6,6.9,6,7v34' +
    'c-0.1,1.6,1.2,2.9,2.8,3c0.1,0,0.1,0,0.2,0h26c1.6,0.1,2.9-1.2,3-2.8c0-0.1,0-0.1,0-0.2v-3C38,36.9,37.1,36,36,36z' +
    ' M20,40H10V8h10V40z"/>' +
    '</svg>'
);

export default ColumnsIcon;
