# Dynamic Form Viewer

A Salesforce **Lightning Web Component** that renders arbitrary record JSON as a read-only, nested form — no per-form configuration and no templates. Point it at a text/long-text field containing a JSON payload (for example an OmniScript submission stored on a record) and it walks the structure recursively, rendering objects as sections, arrays as repeating item blocks, and scalars as label/value rows. File-upload arrays are detected and shown as downloadable file chips.

## What's in the package

| Component | Purpose |
|-----------|---------|
| `dynamicFormViewer` | Container LWC. Reads the JSON field from the record, resolves which sections to show, and renders the tree. Exposed to the Lightning App Builder for record pages. |
| `dynamicFieldRenderer` | Recursive child LWC. Renders a single node (section, item, scalar, or file list) and calls itself for nested structures. |
| `jsonNodes.js` | Shared, framework-free module with the parsing/normalisation logic (label formatting, node building, OmniScript header filtering, `OmniScriptFmtData` handling, file-size formatting). Unit-tested. |

## Requirements

- A Salesforce org (any edition that supports Lightning Web Components).
- [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) (`sf`) for deployment.
- The component reads its data from a field on the record. By default it expects `Application_Form_JSON__c`, but this is configurable in the App Builder (see **Configuration**). **This field is not included in the package** — create it (or point the component at an existing field) in your org.

## Deploy

1. Authorise your org (once):

   ```bash
   sf org login web --alias myOrg
   ```

2. From the project root, deploy the source:

   ```bash
   sf project deploy start --source-dir force-app --target-org myOrg
   ```

3. Ensure the record's object has a text or long-text field holding the JSON (default API name `Application_Form_JSON__c`), or plan to point the component at an existing field.

## Add it to a record page

1. Open a record of the relevant object.
2. **Setup gear -> Edit Page** (Lightning App Builder).
3. Drag **Dynamic Form Viewer** onto the page.
4. Set its properties (see below), then **Save** and **Activate**.

## Configuration (App Builder properties)

| Property | Default | Description |
|----------|---------|-------------|
| **Render Source** (`sourceMode`) | `fmtData` | `fmtData` renders OmniScript's display-formatted answer set (`OmniScriptFmtData`) — only the fields the user saw. `raw` renders the raw payload tree (filtered by the header blocklist / Root Path / Exclude Keys). Falls back to `raw` if `OmniScriptFmtData` is absent. |
| **JSON Field API Name** (`jsonFieldName`) | `Application_Form_JSON__c` | API name of the field on the record holding the JSON. |
| **Root Path** (`rootPath`) | *(blank)* | Dotted path to render from, e.g. `PersonalDetails`. Blank renders the whole payload (with the OmniScript header filtered out). |
| **Exclude Keys** (`excludeKeys`) | *(blank)* | Comma-separated extra top-level keys to hide, in addition to the known OmniScript header keys. |
| **Include top-level simple fields** (`includeScalarSections`) | `false` | By default only object/list sections show (hides OmniScript metadata). Turn on to also show plain top-level fields. |

## Run the tests

```bash
npm install
npm run test:unit
```

Jest (via `@salesforce/sfdx-lwc-jest`) covers the `jsonNodes` parsing logic and the renderer.

## Lint & format

```bash
npm run lint
npm run prettier:verify
```

## Notes

- The component is **read-only** — it presents submitted data, it does not edit records.
- All parsing lives in `jsonNodes.js` so on-screen rendering has a single source of truth; if you later add a document/PDF generator, reuse the same module.
- No external runtime dependencies are bundled; the `devDependencies` in `package.json` are for local linting/testing only.
