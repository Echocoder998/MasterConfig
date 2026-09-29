# Daughtridge Product Configurator

## Proposal review, model management and entry animation

AI datasheet imports, admin chat edits and rules requests now open a structured **Review proposed changes** screen. The comparison is generated from model data, grouped into model information, step sequence, fields/options, compatibility rules and other settings. It includes validation, source references and warnings for removed choices, ordering-code changes and restrictions. **Apply proposal** accepts the complete proposal into the **unsaved draft**; **Discard proposal** leaves model data unchanged. Save/activate remain separate, with the existing source-review requirement. Recent chat is kept separately until an explicit model save.

Editing while a proposal is pending blocks application until **Refresh comparison** is selected and the replacement is reviewed again. A model saved or deleted in another tab/session blocks application and requires reopening the latest model and requesting a new proposal. Saved-catalog revisions are also checked during persistence.

Admin's model list supports name/ID/base-code/manufacturer search; combined manufacturer, status and updated-date filters; inclusive custom dates in the user's local timezone; unknown legacy dates; counts, reset and name/date sorting. Mobile layouts show the same information and actions as cards.

The existing entry screen has a lightweight CSS logo entrance and instrumentation line accent. The original logo asset is unchanged. The entrance runs once per page mount; reduced-motion users see a static composition. No animation dependency or extra landing route was added.

**Storage and setup:** hosted builds retain the Vercel static frontend and authenticated Cloudflare D1/R2 backend. UTC timestamps live in each model's existing JSON, so **no schema migration or new environment variables are required**. Cloud saves use the Worker's clock and one transaction for models, rules and revision; local saves use an IndexedDB transaction and the browser clock. Only changed/new models receive a new updatedAt. Existing timestamps are preserved; undated legacy records stay unknown until edited and saved. A failed write does not publish timestamps or editor state. The normal frontend and Worker build must both be used when deploying this version; this change does not deploy them.

**Implementation:** src/proposal.js and src/proposal-review.js handle comparisons/application; src/model-list.js handles filtering; src/model-data.js, src/storage.js and server/api.mjs handle timestamps and persistence. src/admin.js and src/chat-dock.js connect the workflows. src/index.html and src/improvements.css provide the entry and responsive review/list layouts. scripts/build.mjs includes the shared timestamp helper in the Worker output.

**Verification:** run npm run check for unit/persistence tests and the build. SQLite persistence tests use Node's bundled node:sqlite (verified on Node 24). Optional browser tests require Playwright available locally and a running built local site on port 3017 (or TEST_BASE_URL); run npm run test:ui. PLAYWRIGHT_MODULE may point to an existing Playwright module URL, and BROWSER_EXECUTABLE may select an installed browser. These tests use isolated browser contexts and mock AI responses, exercise PDF/CSV imports, rules, stale proposals, save separation, cross-tab conflicts, mobile layouts and reduced motion, and save screenshots under verification/. No live AI call or production deployment is part of verification.

The older sections below also describe the original local prototype.

A portable, browser-based prototype for adding instrument models from Excel or text-based PDF datasheets and configuring them in an editable sequence. The original Ashcroft 1279 model is included.

## Open in VS Code

1. Extract the project ZIP. Open the `dasco-configurator` folder in VS Code.
2. Install Node.js 22 or newer if it is not already installed.
3. Open Terminal → New Terminal in the project folder.
4. Run `npm run build`, then `npm start`.
5. Open `http://localhost:3000` in a current Chrome, Edge or Firefox browser.

The configurator and local imports need no npm install, API key or paid service. Optional AI chat requires a separately billed OpenAI API connection. The PDF and Excel ZIP readers are bundled locally. Use the local server rather than opening index.html directly.

After editing a file in `src/`, run `npm run build` and refresh the browser. Stop the server with Ctrl+C. Set the PORT environment variable to change port 3000. The VS Code Build task runs the build command.

## Add a model

### Excel (recommended)

1. Open Admin → Import datasheet → Download Excel template.
2. The workbook contains a complete example of the existing pilot's supported fields and rules. Replace its data for your new model. Do not keep Ashcroft rules when changing to another product.
3. Keep `Model`, `Options`, and `Rules` tab names and the row-1 headers. `Instructions` is informational.
4. Use one option per row. Store codes as **text**, especially `02`, `04` and other leading-zero codes.
5. Upload `.xlsx`. The model is an editable draft. Review Details, Fields & options, Rules, Source, and Selection order.
6. Tick the source-review checkbox and select Save & activate model. It becomes available in the configurator's Model menu.

CSV imports can use the same columns as the Options sheet. Other Excel sheets can be mapped by column. Keep headers in the first nonempty row. Old binary `.xls` files must be saved as `.xlsx`. Formula cells use their saved cached values; the importer does not calculate Excel formulas.

### PDF

1. Upload a text-based PDF, maximum 20 MB / 80 pages.
2. PDF.js extracts text. A deterministic parser proposes code/description rows beneath recognizable ordering headings. The basic extractor does **not** use an AI service. Instructions & AI chat can analyze the original PDF when a server API key is configured.
3. Review every code, category, type (single/multiple), required flag, ordering position, prefix and default. Wrapped descriptions and multi-column layouts can be incomplete. Missing ranges or unrecognized options must be added manually.
4. Review full extracted text and the original PDF in Source. Enter restrictions in Rules. Restrictions are **not** inferred automatically.
5. Save incomplete work as a draft. Activate only after verifying the model against manufacturer information.

Scanned/image-only PDFs need OCR outside this prototype. Password-protected files may fail to import. Source replacement attaches a new reference without rebuilding existing model data.

## Change the selection sequence

Admin → Edit model → Selection order.

- Use step ↑ / ↓ buttons to reorder steps.
- Within a step containing multiple fields, use field ↑ / ↓ to reorder them.
- Use Separate step to give a field its own screen.
- In Fields & options, choose a different Step to regroup a field.
- Review always remains last.
- Required conditional fields remain conditional even if you move them. Consider placing the controlling field before its dependent field.

Selection sequence and ordering-code sequence are independent. `codeOrder` controls the manufacturer code. A zero position means a separate item such as a certificate. Fields with identical positions and prefixes concatenate into one segment. The draft code uses spaces between segments. Verify combined-option syntax with the manufacturer before ordering.

## Rules

Each rule has one or more AND conditions and an action:

- `exclude`: block listed target options and remove conflicting choices when earlier inputs change.
- `require`: prevent a completed configuration until all target codes are selected. Required options are shown as outstanding requirements; they are not silently added.

Operators: `eq`, `neq`, `contains` (multi-select), `in` (codes separated with `|`), `gt`, `lt`. Numeric comparisons operate on numeric codes, not labels or unit-bearing codes such as `30000#`; use `in` for those codes. Add separate rules for OR conditions. Options are scoped by field ID, so the case code `SH` and pointer code `SH` are distinct.

Validation checks option-code duplicates, rule references, field/step assignments and required metadata before activation. It does not certify engineering suitability, completeness of manufacturer documentation or whether every possible configuration is satisfiable. Final application and order review remain necessary.

## Saving and moving your work

Models and source attachments are saved in IndexedDB on the current browser and origin. They are not shared across devices, users or the hosted and localhost versions. Clearing browser site data removes local edits.

Use Admin → Export catalog regularly. The JSON backup includes all saved models and uploaded source files. In the local VS Code copy use Admin → Restore catalog. Matching IDs require confirmation before replacement. Unsaved editor changes are not included in catalog exports.

`src/catalog.json` is the starting catalog, used when there is no saved browser catalog. To apply an edited seed to an existing browser, restore that catalog JSON in Admin. Individual model JSON export is useful for editing; paste it into a model's Source → Advanced model JSON editor while preserving the target model ID, or wrap it in `{ "schemaVersion": 1, "models": [ ... ] }` for catalog restoration. A single model export does not contain source-file bytes; use the full catalog backup to transfer attachments.

A saved draft is intentionally not selectable in the configurator. Editing an active model and saving it as a draft deactivates it until reviewed and activated again. Drafts can be incomplete.

## Project map

- `src/app.js`: configuration interface and model selection.
- `src/admin.js`: catalog, import, editing, activation and sequence controls.
- `src/engine.js`: deterministic rules, validation and ordering-code assembly.
- `src/importers.js`: Excel/CSV readers and PDF extraction/candidate parsing.
- `src/storage.js`: IndexedDB storage and portable backups.
- `src/catalog.json`: initial Ashcroft model, options and explicit rules.
- `src/style.css`: shared desktop/mobile visual styling.
- `public/templates/model-import-template.xlsx`: filled import template.
- `public/datasheet.pdf`: supplied Ashcroft source document.
- `public/vendor/`: bundled PDF.js and JSZip plus licenses.
- `scripts/`: portable build and local server.
- `tests/`: core rule and import tests. Run `npm test`.
- `dist/`: generated deployable site. Edit src/public rather than dist.

## Current scope and next development

This is a local-data admin prototype, not a shared production administration system. The existing hosted Site remains owner-private. The Admin button itself does not implement staff roles or separate application authentication. Do not make a hosted production catalog public and assume this UI enforces admin permissions.

Future production work: authenticated admin roles, server-backed catalog and file storage, revision/approval history, OCR, pricing/stock integration and Business Central connectivity. Keep any future AI API key on the server; do not add it to these browser files.

The seeded 1279 model covers psi single scales and the previously supported common options. It is not the full manufacturer's catalog and does not select diaphragm seals or certify media/temperature compatibility.

## Validation performed

- 24 automated tests cover reference code, sequence independence, range/material/connection conflicts, certificate requirements, PLUS/link conflicts, case/pointer restrictions, repeated code namespaces, fill prefixes, CSV quoting and leading zeros, conditional fields and invalid model references.
- The actual Excel template was parsed through the app importer and reproduced the reference ordering code with leading zeros preserved.
- The supplied six-page PDF was extracted through the bundled PDF reader and generated reviewable option groups with source-page references.
- JavaScript syntax and local module/asset paths were checked. No browser end-to-end test was performed in this session.


## Instructions and AI chat (version 3)

Admin → Edit model → Instructions & AI chat provides:

- Standing instructions saved with each model.
- An exact section-order editor that works without AI and preserves ordering-code positions.
- Free-form questions and requested edits, when the server's OpenAI API connection is configured.
- The current model, saved instructions, recent chat, and the original PDF sent to the model. PDF vision uses high detail for applicability matrices. Source PDFs sent to AI are limited to 10 MB.
- A proposed model and change summary with Apply proposal / Discard proposal controls. Nothing activates automatically.
- Source-page references and unresolved questions. Validation checks structure and references, not engineering correctness.

The default API model is `gpt-6-astra` with high reasoning. `OPENAI_MODEL` can be set on the server. The model must support Responses API, PDF/image input, reasoning and structured output. Changing a model does not substitute for reviewing the manufacturer's restrictions.

### Configure AI in the VS Code copy

1. Copy `.env.example` to `.env` in the project folder.
2. Set `OPENAI_API_KEY` locally to a key from your OpenAI API project. Do not paste the key into the admin chat, browser code, or this conversation.
3. Set `OPENAI_MODEL` if needed, then restart `npm start`.
4. Use Check connection in the AI tab. This checks key presence only; the first provider request verifies account/model access.

The local server reads `.env`; Git and the export script exclude real environment files. The cloud Worker reads the corresponding server secrets. Configure hosted keys through the approved OpenAI Developers connection and Sites secrets. The built app reports that AI is unavailable until the server key exists. No live provider call was possible during this update; provider-response handling was tested with a mock.

The hosted app must remain owner-private until server-side admin authorization, rate limiting and budget controls are implemented. Same-origin checks prevent cross-origin browser calls, but they are not a replacement for authentication. The cloud Worker runs AI requests in OpenAI background mode: it starts the job, the browser polls every few seconds with a signed job token, and the Worker deletes the stored OpenAI response as soon as the result is read (or the request is canceled). Background mode requires `store: true`, so responses are held by OpenAI only while the job runs. This avoids holding one connection open for the several minutes a large datasheet can take. The local dev server still waits on a single `store: false` request. Source documents and chat are transmitted to the API for processing; admin requests include the PDF, sales questions do not. API usage is billed separately.

### Switch datasheet correction

A prepared draft for the supplied Ashcroft B/D/H Rev J datasheet is included. Existing browser catalogs receive this new draft without overwriting saved models. The importer recognizes this exact revision and uses the prepared profile, rather than relying on heading guesses. Other revisions must be reviewed separately.

Five sections: Enclosure → Switch element → Actuator seal → Options → Range. B4, B7, D4, D7 and H4 remain choices in one enclosure field. H4 has its own listed elements, Viton seal and hydraulic ranges. B/D pressure and differential ranges are kept distinct. The page-5 applicability dots and clear footnotes supply restrictions. Ambiguous approvals and the 7500/7000 H4 discrepancy remain review notes.

### Server files and hosted build

- `server/ai.mjs`: server-only Responses API request, PDF input, proposal validation and HTTP handlers.
- `src/assistant.js`: chat, persistent instructions and proposal review.
- `src/switch-profile.json`: prepared switch-family draft.
- `scripts/build.mjs`: creates browser assets plus a self-contained Cloudflare Worker in `dist/server/`.
- `tests/ai-switch.test.mjs`: switch restrictions, AI request construction, identity preservation, disabled-key behavior, cross-origin rejection and mock-provider results.

The local server listens only on loopback. Deployments use Sites owner-private access. No API key is embedded in the browser or project archive.

## Delete or deactivate models

In Admin → Model catalog, choose **Mark inactive** to hide a model from the configurator while retaining its data. Choose **Review & reactivate**, review the model, check the review confirmation and **Save & activate model** to bring it back. The editor also offers **Save as inactive**.

**Delete model** removes a model after confirmation. Export a catalog backup first if you might need to restore it. Deletions and inactive status persist in this browser, including when the catalog is empty. A saved catalog is authoritative; bundled sample models are only loaded for a fresh browser. Attached source blobs are retained locally so deleting a duplicate cannot break another model’s reference.

## Compatibility rules

Open Admin → Edit model → Rules. Use the dropdown builder for a pair of options: **Cannot be combined with** adds exclusions in both directions; **Requires this option** adds a conditional requirement that blocks completion until satisfied. You can match any field, including an enclosure, range, or multi-select option. The advanced rule editor supports multiple AND conditions; separate rules express alternatives. Save and activate after review to apply changes to the configurator.

Expand **Describe a rule with AI** to give plain-language instructions. When the server API key is configured, the assistant proposes rule changes for review and applies them only to the draft. Rules-only requests preserve fields, steps and ordering-code settings on the server. This AI helper uses the same connection as model chat; without a key, the manual builder remains available.

## Branding

The header uses the supplied Daughtridge Sales logo at `public/daughtridge-sales-logo.png`, unchanged. The color palette follows the May 2026 line card: deep red, white, charcoal and neutral gray. Brand styling is in `src/style.css`; header markup is in `src/index.html`.
