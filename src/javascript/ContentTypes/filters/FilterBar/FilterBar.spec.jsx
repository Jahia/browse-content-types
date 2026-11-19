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

    it('shows the group of each field as a title in the Add filter menu', () => {
        const grouped = fields.map(field => ({...field, group: field.key.startsWith('prop:') ? 'Type-specific' : 'Common'}));
        render(<FilterBar fields={grouped} filters={[]} defaultFields={[]} onChange={jest.fn()}/>);
        fireEvent.click(screen.getByRole('button', {name: /addFilter/}));
        const items = [...document.querySelectorAll('.moonstone-collectionBar_addFilterMenu li')].map(item => item.textContent);
        expect(items).toEqual(['Common', 'Name', 'Last modified', 'Created by', 'Type-specific', 'Price']);
    });

    it('applies the value with the Filter button', () => {
        const onChange = renderBar({filters: []});
        fireEvent.click(screen.getByRole('button', {name: /Created by/}));
        fireEvent.change(screen.getByRole('textbox', {name: 'valueField'}), {target: {value: 'anne'}});
        fireEvent.click(screen.getByRole('button', {name: 'apply'}));
        expect(onChange).toHaveBeenCalledWith([{field: 'std:createdBy', operator: 'contains', value: 'anne'}]);
    });

    it('ticks the values of a choice in the selector, and applies them with the Filter button', () => {
        const type = {key: 'prop:type', label: 'Type', kind: 'choice', property: 'type', options: [
            {value: 'house', label: 'House'}, {value: 'apartment', label: 'Apartment'}, {value: 'building', label: 'Building'}
        ]};
        const onChange = jest.fn();
        render(<FilterBar fields={[type]} filters={[]} defaultFields={['prop:type']} onChange={onChange}/>);
        fireEvent.click(screen.getByRole('button', {name: /Type/}));
        fireEvent.click(screen.getByRole('checkbox', {name: 'Apartment'}));
        fireEvent.click(screen.getByRole('checkbox', {name: 'Building'}));
        // The footer stays usable: no popup list covers it
        fireEvent.click(screen.getByRole('button', {name: 'apply'}));
        expect(onChange).toHaveBeenCalledWith([{field: 'prop:type', operator: 'is', value: ['apartment', 'building']}]);
    });

    it('searches the values of a long choice', () => {
        const options = Array.from({length: 15}, (_, index) => ({value: `v${index}`, label: `Value ${index}`}));
        render(<FilterBar fields={[{key: 'prop:c', label: 'Country', kind: 'choice', property: 'c', options}]} filters={[]} defaultFields={['prop:c']} onChange={jest.fn()}/>);
        fireEvent.click(screen.getByRole('button', {name: /Country/}));
        expect(screen.getAllByRole('checkbox')).toHaveLength(15);
        fireEvent.change(screen.getByLabelText('searchValues'), {target: {value: 'Value 1'}});
        // Value 1, and Value 10 to Value 14
        expect(screen.getAllByRole('checkbox')).toHaveLength(6);
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
