# ABB ProcessMaster FEP631 profile

This addition supports a bounded **request for quotation (RFQ)** for the integral-mount ProcessMaster FEP631 electromagnetic flowmeter. It does not generate a manufacturer part number, size a meter, approve an application, or calculate pressure/temperature derating. The existing Ashcroft ordering-code behavior is unchanged.

## Add it to an existing catalog

1. Build and run this version of the application. Sign in as Admin when using shared storage.
2. In **Admin → Model catalog**, select **Add ABB ProcessMaster draft**. This opens an unsaved draft. Leaving and discarding it does not change the catalog.
3. Review **Details**, **Fields & options**, **Rules**, and **Source**, including the source-review questions. Select **Save as draft** to retain the work without exposing it to sales.
4. After checking the current ABB source and regional availability, select the source-review checkbox and **Save & activate model**. Activation makes the RFQ profile selectable; the RFQ-only labeling and requirement for ABB confirmation remain.

The model ID is `abb-processmaster-fep631`. The add action refuses any existing model with that ID, including an inactive model, and never overwrites its customizations. Use **Edit model** for an existing entry. Saves use the existing catalog revision/concurrency checks and preserve other catalog entries. No automatic catalog migration or production mutation is performed.

New empty catalogs receive this profile as a draft in the built seed. Existing hosted catalogs are not reseeded: updating the frontend/Worker alone does not add ABB to them. No database schema change or new environment variable is needed.

The build also produces `dist/site/catalog-additions/abb-processmaster-fep631.json`, a portable one-model draft catalog packet. It can be used with **Restore catalog**, which uses the application's existing explicit replacement confirmation for matching IDs. Prefer the **Add ABB ProcessMaster draft** action for an existing catalog because it refuses replacement entirely. The packet contains source URLs rather than an embedded copy of ABB's PDF.

## Implemented scope

| Area | Supported requests and constraints |
| --- | --- |
| Mounting | FEP631 integral mount, IP67 transmitter / IP67 sensor; remote FEP632/FET632 is excluded |
| Meter size | Documented sizes DN 15–600; no size is preselected and no flow sizing is performed |
| Connections | ASME B16.5 Class 150/300; DIN PN 63/100 only at DN 25–200 with hard rubber |
| Connection material | Carbon steel or stainless steel; DN 15 limited to stainless steel; exact grade remains an ABB confirmation item |
| Liners | PTFE, PFA, ETFE, hard/soft rubber and thick PTFE, with source size limits |
| Electrodes | Standard/pointed design; 316Ti, Hastelloy C-4/B-3, titanium, tantalum or platinum-iridium; pointed design through DN 400 |
| Grounding | Grounding/full-pipe electrode requests and zero/one/two mounted rings; detection size and ring/liner constraints |
| Approvals and housing | Non-Ex, ATEX/IECEx Zone 1 or Zone 2, cFMus Div. 2; aluminum single/dual compartment, M20 or ½-in NPT; Zone 1 requires dual compartment |
| Sensor design | Standard or high-temperature design, requested ambient ranges; high-temperature design excludes rubber; these choices do not prove combined operating limits |
| Electronics | 100–230 V AC or 24 V DC with 50/60 Hz setting; display/no display; HART, Modbus RTU, PROFIBUS DP, one/two-port Ethernet; matching communication-card requirements; Ethernet housing/approval restrictions |
| I/O | Two card slots, selected analog/digital/loop-power cards; at most one optional digital input and one optional digital output card |
| Calibration | 0.4% or 0.3%, two/three/five points; 0.3% requires three/five points; ISO 17025 requires five points; standard/witnessed calibration, inspection and SIL2 certificate requests |

The Ethernet protocol request captures EtherNet/IP, Modbus TCP or Webserver and appears only for Ethernet output selections. It is a quote request, not a complete description of every activatable protocol/license combination. Output selection controls the matching option card; changing the protocol clears an incompatible card without resetting the meter's other choices.

Out of scope: remote mounting, other sizes/flanges, high-pressure special builds, ceramic/Linatex or double-layer electrodes, PoE, APL, PROFIBUS PA, NEPSI, cFMus Div. 1, potable-water/food approvals, 0.2% calibration, enhanced diagnostics/batching and unspecified special options. Absence from this profile does not imply that ABB cannot supply an option.

## Source and engineering review

The profile was checked against the official [ABB ProcessMaster FEP630 datasheet, DS/FEP630-EN Rev. L, October 2025](https://library.e.abb.com/public/4ed922dcaaf04b01b2d951c80b4fe9ce/DS_FEP630_EN_L.pdf) and [ABB's ProcessMaster FEP630 product page](https://new.abb.com/products/measurement-products/flow/electromagnetic-flowmeters/processmaster/processmaster-fep630). Source URLs, revision, review date and page references travel with the model. The downloaded PDF used for review has 92 pages; the reviewed table page numbers correspond to the printed page numbers. Pages 18, 52 and 70–76 were rendered and inspected to verify table columns and footnotes. SHA-256 of the reviewed PDF: `EB707422C0B7595AD86A56D107EB92893CB1C5284B3A8E18F549C841F2CA9A84`.

| Evidence | Use |
| --- | --- |
| Pages 18–19 | Materials by size, combined pressure/temperature review and vacuum limits |
| Pages 34–39 | Flanged size/dimensional context |
| Page 52 | Maximum quantities of optional I/O cards |
| Pages 70–75 | FEP631 option codes, requests and order-table positions |
| Page 76 | Size, liner, housing, grounding, calibration and communication footnotes |

Known source ambiguities are retained in the draft's Source tab:

- cFMus Div. 1 references notes 30 and 32, whose size implications conflict. That option is excluded pending ABB clarification.
- The 0.2% calibration row references note 27 although note 24 describes 0.2% restrictions. It is excluded pending clarification.
- Full-pipe detection ordering notes 17/19 allow DN 50 and larger, while page 5 describes diagnostic prerequisites as greater than DN 50. This profile captures the electrode availability request and explicitly requires confirmation of diagnostic performance and installation conditions.
- Design level is assigned by ABB. Exact material grades, remaining order positions, cable/connectors, regional approvals and current availability are not fully determined by this profile.

The export and Review screen request fluid/composition/conductivity, minimum/normal/maximum flow, operating pressure and temperature (including vacuum and cleaning), material compatibility, grounding and installation, ambient/hazardous-area conditions and final ABB ordering confirmation. The checklist identifies data still to supply; it does not claim that those engineering checks have passed. A nominal flange class or requested temperature design is not a validated operating-pressure rating.

## Implementation and verification

`src/abb-profile.js` is the single source of profile data. `src/bundled-models.js` stages isolated drafts and adds missing profiles only to build-time seeds. `scripts/build.mjs` creates both the frontend/Worker seed and portable packet from that same source. Nothing reads or writes a production catalog during the build.

`outputMode: "rfq"` suppresses ordering-code assembly even if code positions are later populated. `src/configuration-summary.js` provides consistent RFQ labeling, readable selections, source links and application checklists for copy/download. Sales AI receives the RFQ label, and AI proposal normalization retains the classification, provenance and checklist. Admins still control explicit edits and activation.

Run `npm run check` for unit/persistence coverage and a build. ABB tests exercise the size/liner matrix, pressure/liner dependencies, grounding, housing/Ex, I/O quantities, communication switching, calibration, source/export semantics, AI metadata preservation and additive/duplicate behavior. Existing Ashcroft tests protect its manufacturer example and compatibility rules.

With a built local server on port 3017 (or `TEST_BASE_URL`) and Playwright configured, `npm run test:ui` also covers ABB addition/discard/save/reload, activation separation, shared-storage additive writes, incompatible changes, RFQ downloads and desktop/mobile layout. Browser tests use isolated contexts and mocked shared APIs; they do not modify production or call live AI.
