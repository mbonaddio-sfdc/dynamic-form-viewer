# Dynamic Form Viewer

A Salesforce **Lightning Web Component** that replays any submitted form from its stored JSON — with no per-form template to design or maintain. Point it at a JSON field and it renders whatever shape it finds: objects become sections, arrays become repeating item blocks, scalars become label/value rows, and file uploads become downloadable chips.

---

## The idea — one component, any form

Most form-display solutions hard-code a layout for each form, which means a new build every time a form changes shape. This component takes the opposite approach: **the data describes the layout**.

When a user completes an OmniScript (or any process that saves its answers as JSON) the result is a structured document — sections, fields, repeating blocks, file uploads. All of that structure is already in the data. The viewer walks it at runtime and turns each piece into the right on-screen element, so the same component handles a boat-registration form, a practitioner complaint, or a form that didn't exist when the component was written.

| | |
|---|---|
| **No template** | Nothing is hard-coded to a specific form — the renderer adapts to whatever nesting and field types the JSON contains. |
| **Read-only** | Shows exactly what was submitted, formatted for people (dates, Yes/No, file chips), without altering the record. |
| **Admin-tunable** | Which field to read, where to start in the tree, and which keys to hide are all set in App Builder — no code change. |

---

## How it works — from stored JSON to a rendered form

Four stages turn a blob of text on the record into an interactive, tabbed view. The middle stage — the recursion — is where the "any shape" behaviour lives.

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  1 · READ    │ → │  2 · RESOLVE │ → │ 3 · BUILD    │ → │  4 · RENDER  │
│              │   │              │   │    NODES     │   │              │
│ Wire to the  │   │ Drop runtime │   │ jsonNodes.js │   │ Recursive    │
│ record, read │   │ noise; pick  │   │ types each   │   │ renderer:    │
│ the JSON     │   │ the sections │   │ key/value &  │   │ leaves →     │
│ field, parse │   │ worth showing│   │ recurses to  │   │ values,      │
│ the text     │   │              │   │ any depth    │   │ containers → │
│              │   │              │   │              │   │ nested tabs  │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
```

> **Where the flexibility comes from:** a container node (an object, or an array of objects) renders as a tabset and asks the renderer to draw each of its children — which may themselves be containers. That single self-referential step is what lets one small component display a form of any depth or shape.

---

## Node types — what each piece of data becomes

Every value is classified into exactly one node type, each with a matching on-screen treatment. Order matters — files are detected before generic arrays so upload metadata never leaks as raw text.

| Node type | Recognised when the value is… | How it renders |
|-----------|-------------------------------|----------------|
| **Object** *(container)* | A plain object with nested keys | A scoped tabset: a *Details* tab for leaf fields, plus one tab per complex child |
| **Array of objects** *(container)* | An array whose entries are all objects (a repeating block) | One tab per item, titled from the item's own name/title/type |
| **File** | An array of OmniScript file entries (`069…`/`068…` id + filename) | File chips with icon, name, size and a working preview/download link |
| **Date** | A string matching an ISO date/timestamp | A locale-formatted date-time |
| **Boolean** | `true` / `false` | The word **Yes** or **No** |
| **Simple array** | An array of primitives (or mixed/empty) | A bulleted list; empty arrays render blank |
| **Primitive** | A string or number | A labelled value block (0 and false-y numbers still show) |
| **Empty** | `null`, `undefined` or empty string | A blank control — never an "N/A" placeholder |

> **Labels are humanised automatically.** Raw keys like `firstName`, `boat_length_m` or `vessel-type` become **First Name**, **Boat Length (m)** and **Vessel Type** — camelCase, snake_case and kebab-case all read cleanly, and known unit suffixes are preserved.

---

## Worked example — the same data, before and after

Here is a slice of stored form JSON, followed by what the viewer produces from it — no template was written for this form.

**Stored JSON (excerpt)**

```json
{
  "ApplicantDetails": {
    "firstName": "Dana",
    "lastName": "Okafor",
    "dateOfBirth": "1987-04-12",
    "isPrimaryOwner": true
  },
  "Vessels": [
    { "name": "Sea Sprite", "boat_length_m": 7.4 }
  ],
  "Attachments": [
    { "filename": "survey.pdf", "data": "069AB0000012xyz", "size": 54210 }
  ]
}
```

**Rendered form** — tabs: `Applicant Details` · `Vessels` · `Attachments`

*Applicant Details tab:*

| Field | Value |
|-------|-------|
| First Name | Dana |
| Last Name | Okafor |
| Date Of Birth | 12 April 1987 |
| Is Primary Owner | Yes |

*Attachments tab:*

| File | Size |
|------|------|
| 📎 survey.pdf | 52.9 KB |

**What happened:** `ApplicantDetails` became a tab of labelled values; the ISO date was formatted; the boolean became *Yes*; the repeating `Vessels` array became its own tab; and the attachment — detected by its `069…` id and filename — became a downloadable file chip with a human-readable size. None of it was coded for this particular form.

---

## Render modes — two ways to read the same payload

OmniScript payloads carry both the raw working state and a clean set of display-formatted answers. The viewer can read either, selected in App Builder.

- **`fmtData` mode (default)** — reads `OmniScriptFmtData`, the flat map of user-facing answers, and rebuilds it into *step → block → field*. Only what the user saw, already display-formatted, with no session noise.
- **`raw` mode** — walks the full data tree, dropping known OmniScript envelope keys and any admin-listed exclusions. Useful when you need values that never appeared on screen.
- **Any JSON works** — point it at any JSON field. Use *Root Path* to start deeper in the tree and *Exclude Keys* to hide fields — no OmniScript required.

---

## What's in the package

| Component | Purpose |
|-----------|---------|
| `dynamicFormViewer` | Container LWC. Reads the JSON field from the record, resolves which sections to show, and renders the tree. Exposed to the Lightning App Builder for record pages. |
| `dynamicFieldRenderer` | Recursive child LWC. Renders a single node (section, item, scalar, or file list) and calls itself for nested structures. |
| `jsonNodes.js` | Shared, framework-free module with the parsing/normalisation logic (label formatting, node building, OmniScript header filtering, `OmniScriptFmtData` handling, file-size formatting). Unit-tested. |

The parsing logic lives entirely in `jsonNodes.js` — pure JavaScript with no LWC or DOM dependency — so it can be unit-tested in isolation and reused beyond the on-screen viewer. The same node tree that drives the on-screen tabs could feed a document generator: a future *"save this form as a PDF on the record"* feature would reuse `jsonNodes.js` unchanged.

---

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

## Configuration (Lightning App Builder)

| Property | What it controls |
|----------|------------------|
| **Render Source** | `fmtData` (default) or `raw` |
| **JSON Field API Name** | Which field to read, default `Application_Form_JSON__c` |
| **Root Path** | Optional dotted path to start rendering from |
| **Exclude Keys** | Comma/semicolon/newline list of keys to hide |
| **Include top-level simple fields** | Also show scalar keys at the root (off by default) |

## Testing

```bash
npm install
npm run test:unit
```

The component is **read-only** — it never writes back to the record.
