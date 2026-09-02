import { createElement } from 'lwc';
import DynamicFieldRenderer from 'c/dynamicFieldRenderer';

function render(node, depth = 0) {
    const el = createElement('c-dynamic-field-renderer', {
        is: DynamicFieldRenderer
    });
    el.node = node;
    el.depth = depth;
    document.body.appendChild(el);
    return el;
}

const flush = () => Promise.resolve();

describe('c-dynamic-field-renderer', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('renders a primitive value with its label', () => {
        const el = render({
            key: 'name',
            label: 'Name',
            type: 'primitive',
            value: 'Ada',
            displayValue: 'Ada'
        });
        return flush().then(() => {
            const label = el.shadowRoot.querySelector(
                '.slds-form-element__label'
            );
            expect(label.textContent).toBe('Name');
            const text = el.shadowRoot.querySelector(
                'lightning-formatted-text'
            );
            expect(text.value).toBe('Ada');
        });
    });

    it('renders a boolean as Yes/No', () => {
        const el = render({
            key: 'active',
            label: 'Active',
            type: 'boolean',
            value: true,
            displayValue: 'Yes'
        });
        return flush().then(() => {
            expect(el.shadowRoot.textContent).toContain('Yes');
        });
    });

    it('renders a date via formatted-date-time', () => {
        const el = render({
            key: 'created',
            label: 'Created',
            type: 'date',
            value: '2026-01-15T09:30:00Z'
        });
        return flush().then(() => {
            const dt = el.shadowRoot.querySelector(
                'lightning-formatted-date-time'
            );
            expect(dt).not.toBeNull();
            expect(dt.value).toBe('2026-01-15T09:30:00Z');
        });
    });

    it('renders a simple array as a list', () => {
        const el = render({
            key: 'tags',
            label: 'Tags',
            type: 'simpleArray',
            hasItems: true,
            items: [
                { key: 't0', value: 'a' },
                { key: 't1', value: 'b' }
            ]
        });
        return flush().then(() => {
            const lis = el.shadowRoot.querySelectorAll('li');
            expect(lis.length).toBe(2);
        });
    });

    it('recurses into a nested object', () => {
        const el = render({
            key: 'address',
            label: 'Address',
            type: 'object',
            isEmptyContainer: false,
            fields: [
                {
                    key: 'address.city',
                    label: 'City',
                    type: 'primitive',
                    displayValue: 'Hobart'
                }
            ]
        });
        return flush().then(() => {
            const children = el.shadowRoot.querySelectorAll(
                'c-dynamic-field-renderer'
            );
            expect(children.length).toBe(1);
        });
    });

    it('renders each item of an array of objects', () => {
        const el = render({
            key: 'lines',
            label: 'Lines',
            type: 'arrayOfObjects',
            isEmptyContainer: false,
            items: [
                { key: 'lines[0]', title: 'A', fields: [] },
                { key: 'lines[1]', title: 'B', fields: [] }
            ]
        });
        return flush().then(() => {
            const items = el.shadowRoot.querySelectorAll('.dfr-array-item');
            expect(items.length).toBe(2);
        });
    });
});
