import { LightningElement, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';

/**
 * dynamicFieldRenderer
 * --------------------
 * Renders a single normalized "node" from a parsed JSON structure and recurses
 * into itself for nested objects and arrays-of-objects, so data of arbitrary
 * depth is displayed rather than silently dropped.
 *
 * A node is a plain object of the shape produced by buildNode(), with a `type`
 * discriminator the template switches on:
 *   - 'primitive'      : string / number rendered as text
 *   - 'boolean'        : rendered as Yes / No
 *   - 'date'           : ISO-8601 string rendered via formatted-date-time
 *   - 'simpleArray'    : array of primitives rendered as a bulleted list
 *   - 'object'         : nested object -> nested tabset
 *   - 'arrayOfObjects' : array of objects -> nested tabset (one tab per item)
 *   - 'file'           : OmniScript File-element upload(s) -> download/preview chips
 *   - 'empty'          : null / undefined / empty rendered as a blank
 *
 * Nesting UI: container nodes (object / arrayOfObjects) render as a nested
 * SLDS tabset. Leaf fields collect into a "Details" tab; each nested
 * object / array-of-objects child gets its own tab and recurses.
 */
export default class DynamicFieldRenderer extends NavigationMixin(
    LightningElement
) {
    /** The normalized node to render. */
    @api node;

    /** Current nesting depth (0 = top level). Kept for potential styling. */
    @api depth = 0;

    // --- leaf type getters ------------------------------------------------

    get isPrimitive() {
        return this.node && this.node.type === 'primitive';
    }
    get isBoolean() {
        return this.node && this.node.type === 'boolean';
    }
    get isDate() {
        return this.node && this.node.type === 'date';
    }
    get isSimpleArray() {
        return this.node && this.node.type === 'simpleArray';
    }
    get isEmpty() {
        return this.node && this.node.type === 'empty';
    }
    get isFile() {
        return this.node && this.node.type === 'file';
    }

    /**
     * Open the standard Lightning file-preview modal for a clicked file.
     * Only wired for files that carry a ContentDocumentId (069). Files with
     * only a version id (068, e.g. some guest uploads) fall back to the plain
     * download link in the template, so this handler is never reached for them.
     */
    handlePreview(event) {
        const documentId = event.currentTarget.dataset.documentId;
        if (!documentId) return;
        event.preventDefault();
        this[NavigationMixin.Navigate]({
            type: 'standard__namedPage',
            attributes: { pageName: 'filePreview' },
            state: {
                recordIds: documentId,
                selectedRecordId: documentId
            }
        });
    }

    // --- container detection ---------------------------------------------

    get isObject() {
        return this.node && this.node.type === 'object';
    }
    get isArrayOfObjects() {
        return this.node && this.node.type === 'arrayOfObjects';
    }

    /** Any container renders as a tabset rather than a leaf control. */
    get isContainer() {
        return this.isObject || this.isArrayOfObjects;
    }

    /** Container has nothing to show. */
    get isEmptyContainer() {
        return this.node && this.node.isEmptyContainer;
    }

    /** Depth for any children rendered by this node. */
    get childDepth() {
        return (this.depth || 0) + 1;
    }

    /**
     * Split the child fields of an OBJECT node into leaf fields (-> Details
     * tab) and complex children (-> their own tabs).
     */
    get objectSplit() {
        const fields = (this.node && this.node.fields) || [];
        return splitFields(fields);
    }

    get objectDetailFields() {
        return this.objectSplit.detailFields;
    }
    get objectComplexTabs() {
        return this.objectSplit.complexTabs;
    }

    get hasObjectDetails() {
        return this.objectDetailFields.length > 0;
    }

    /**
     * For arrayOfObjects: one tab per item. Each item's fields are themselves
     * split so a nested item renders its own Details tab + child tabs.
     */
    get arrayItemTabs() {
        const items = (this.node && this.node.items) || [];
        return items.map((item) => {
            const { detailFields, complexTabs } = splitFields(
                item.fields || []
            );
            return {
                key: item.key,
                title: item.title,
                detailFields,
                complexTabs,
                hasDetails: detailFields.length > 0
            };
        });
    }
}

/**
 * Partition a list of already-built child nodes into leaf "detail" fields and
 * "complex" children (nested objects / arrays-of-objects) that each deserve a
 * tab. Mirrors buildSection's split, but operates on nodes that are already
 * built (the renderer receives built nodes, not raw values).
 */
function splitFields(fields) {
    const detailFields = [];
    const complexTabs = [];
    fields.forEach((child) => {
        if (child.type === 'object' || child.type === 'arrayOfObjects') {
            complexTabs.push({
                key: child.key,
                // Nodes are pre-built by buildNode, so label is always set.
                label: child.label,
                node: child
            });
        } else {
            detailFields.push(child);
        }
    });
    return { detailFields, complexTabs };
}
