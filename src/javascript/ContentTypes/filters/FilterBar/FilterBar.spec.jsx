import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {FilterBar} from './FilterBar';

jest.mock('@jahia/jcontent', () => ({}), {virtual: true});

// The label is the last segment of the key, and `{{name}}` stays for CollectionBar to fill
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, options) => {
            const last = (Array.isArray(key) ? key[0] : key).split('.').pop();
            return options?.name ? `${last} ${options.name}` : last;
        },
        i18n: {language: 'en'}
    })
}));

const fields = [
    {key: 'std:displayName', label: 'Name', kind: 'text', property: 'jcr:title'},
    {key: 'std:lastModified', label: 'Last modified', kind: 'date', property: 'jcr:lastModified'},
    {key: 'std:createdBy', label: 'Created by', kind: 'text', property: 'jcr:createdBy'},
    {key: 'prop:price', label: 'Price', kind: 'number', property: 'price'}
];

// The Menu of Moonstone uses ResizeObserver, which jsdom does not have
global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const renderBar = props => {
    const onChange = jest.fn();
    render(<FilterBar fields={fields} defaultFields={['std:lastModified', 'std:createdBy']} onChange={onChange} {...props}/>);
    return onChange;
};

describe('FilterBar', () => {
    it('shows a chip for each field displayed by default, and Add filter for the others', () => {
        renderBar({filters: []});
        expect(screen.getByRole('button', {name: /Last modified/})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /Created by/})).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: /Price/})).not.toBeInTheDocument();
        expect(screen.getByRole('button', {name: /addFilter/})).toBeInTheDocument();
    });

    it('shows the operator and the value of an active filter on its chip', () => {
        renderBar({filters: [{field: 'prop:price', operator: 'gt', value: '100'}]});
        expect(screen.getByRole('button', {name: /Price.*gt 100/})).toBeInTheDocument();
    });

    it('ignores a filter of the URL on a field that is not in the list', () => {
        const onChange = renderBar({filters: [{field: 'prop:gone', operator: 'contains', value: 'x'}, {field: 'prop:price', operator: 'gt', value: '100'}]});
        fireEvent.click(screen.getByRole('button', {name: /clearFilter Price/}));
        expect(onChange).toHaveBeenCalledWith([]);
    });

    it('opens Add filter on the fields that are not displayed, anchored to its button', () => {
        renderBar({filters: [{field: 'std:createdBy', operator: 'contains', value: 'anne'}]});
        fireEvent.click(screen.getByRole('button', {name: /addFilter/}));
        const menu = document.querySelector('.moonstone-collectionBar_addFilterMenu');
        expect(menu).toHaveTextContent('Name');
        expect(menu).toHaveTextContent('Price');
        expect(menu).not.toHaveTextContent('Last modified');
    });

    it('applies the value with the Filter button', () => {
        const onChange = renderBar({filters: []});
        fireEvent.click(screen.getByRole('button', {name: /Created by/}));
        fireEvent.change(screen.getByRole('textbox', {name: 'valueField'}), {target: {value: 'anne'}});
        fireEvent.click(screen.getByRole('button', {name: 'apply'}));
        expect(onChange).toHaveBeenCalledWith([{field: 'std:createdBy', operator: 'contains', value: 'anne'}]);
    });

    it('discards the value with Cancel', () => {
        const onChange = renderBar({filters: []});
        fireEvent.click(screen.getByRole('button', {name: /Created by/}));
        fireEvent.change(screen.getByRole('textbox', {name: 'valueField'}), {target: {value: 'anne'}});
        fireEvent.click(screen.getByRole('button', {name: 'cancel'}));
        expect(onChange).not.toHaveBeenCalled();
    });

    it('clears every filter with Clear all', () => {
        const onChange = renderBar({filters: [{field: 'std:createdBy', operator: 'contains', value: 'anne'}]});
        fireEvent.click(screen.getByRole('button', {name: 'clearAll'}));
        expect(onChange).toHaveBeenCalledWith([]);
    });
});
