# FaultCite counsel-readiness packet

**Packet version:** 1.0  
**Prepared:** September 8, 2026  
**Review target:** FaultCite release 0.3.9 with pending migration 0027  
**Status:** Draft factual handoff for licensed counsel; not legal advice, legal approval, or a compliance certification

## Version and scope record

This packet covers the public pages observed at `https://faultcite.com/` on September 8, 2026: Privacy, Pilot Terms, Security, Support, Pilot, and the home page. Those pages identify release 0.3.9; Privacy and Pilot Terms state an effective date of September 3, 2026.

Before review, give counsel immutable copies or hashes of the exact public documents and product/data-flow version. Counsel approval must identify the exact documents reviewed and must not be inferred from this packet.

## Facts requiring owner input

Do not fill these fields by assumption.

| Required fact | Owner response | Why counsel needs it |
|---|---|---|
| Full legal name of service operator and contracting entity | **TBD** | Identifies the responsible and contracting party |
| Entity type, place of formation, and business/notice address | **TBD** | Contract, privacy, tax, and notice analysis |
| Authorized signatory and title | **TBD** | Contract authority |
| Initial customer locations and user locations | **TBD** | Defines the launch review scope |
| B2B-only posture, minimum user age, and eligibility rules | **TBD** | Eligibility and privacy drafting |
| Intended pilot term, named users/machines, and exit conditions | **TBD** | Pilot agreement scope |
| Price, currency, taxes, trial/discount, renewal, cancellation, and refund rules | **TBD** | Required before paid Stripe checkout |
| Promised support hours, response targets, maintenance windows, RTO, and RPO | **TBD** | Prevents accidental service-level promises |
| Security/privacy incident owner and notification process | **TBD** | Security exhibit and operational response |
| Insurance policies and limits | **TBD** | Cyber, technology E&O/professional, and general/product liability review |
| Customer/OEM manual license model and prohibited content | **TBD** | Copyright, confidentiality, and data-use terms |
| Trademark and software/content IP owner | **TBD** | Ownership and licensing terms |

## Observed product and data-flow inventory

“Observed” means visible in the reviewed source or public pages. It does not establish that a production account, contract, control, or credential is active.

| System or flow | Observed data/use | Facts or documents still needed |
|---|---|---|
| Clerk authentication | User identity, verified email, provider subject, session authentication | Production tenant identity; enabled features; retention; contractual terms/DPA; processing locations |
| Cloudflare Workers, D1, and R2 | Application execution, company/user records, machine and repair records, audit events, manuals and evidence | Production regions/configuration; encryption and backup evidence; retention/deletion behavior; DPA and transfer terms |
| Resend | Invitation email delivery | Production account; sender identity; message/log retention; DPA; processing locations |
| Stripe integration | Customer/subscription identifiers, subscription status, webhook identifiers | Production account/entity; product/price; checkout disclosures; tax/refund/cancellation rules; activation evidence |
| Public pilot form | Name, work email, company, optional message, timestamp/source | Retention; access/deletion workflow; follow-up/marketing rules; consent record |
| In-app support/feedback | User, company, category/severity, message, optional case/contact request | Staffing, retention, escalation, privacy/safety triage, notice disclosure |
| Core application | Company membership; machine identifiers; failure/repair details; labor/parts; manuals; photos/evidence; approvals; exports; audit history | Classification; prohibited/sensitive data rules; full retention/deletion/export map; customer/controller responsibilities |
| Operational telemetry | Request/error information is implied by request IDs and service operation | Exact logs, IP/device/cookie fields, vendors, purposes, access, and retention |

## Documents and decisions for counsel

Counsel should determine the appropriate documents for the confirmed entity, locations, and sales model. The expected review set is:

1. Pilot/order form defining scope, term, users, machines, success measures, stop conditions, commercial conversion, and exit/data return.
2. Commercial terms or master services agreement covering service rights, fees/taxes, customer responsibilities, confidentiality, IP/content/feedback rights, acceptable use, warranty allocation, indemnities, liability, suspension/termination, data return/deletion, notices, and standard contract mechanics.
3. Privacy notice accurately matching the final data map, operator identity, controller/processor roles, subprocessors, retention, request verification, transfers, cookies/logs, children/eligibility position, and policy-change process.
4. Data processing agreement, security exhibit, subprocessor list, and any transfer terms counsel finds necessary.
5. Billing disclosures for Stripe checkout, including renewal, cancellation, refund, pricing-change, tax, and failed-payment treatment.
6. Support/service description and incident-notification terms matching staffed operations and tested recovery capabilities.
7. Customer/OEM manual and uploaded-content rights language.
8. Industrial-safety and product-liability language reviewed alongside a qualified safety adviser and insurance broker.

## Current drafting and operational gaps

| Priority | Gap | Required disposition |
|---|---|---|
| Blocker | Live Pilot Terms say paid checkout remains unavailable. | Do not enable paid checkout until counsel approves consistent commercial/billing terms and the product captures assent. |
| Blocker | Public documents do not identify the legal operator/counterparty. | Supply entity facts and update the counsel draft. |
| Blocker | Pilot Terms do not allocate normal SaaS/commercial, IP, confidentiality, termination, or liability risks. | Counsel prepares or approves the commercial agreement set. |
| Blocker | Industrial maintenance creates safety/product-liability exposure a website disclaimer cannot resolve. | Obtain written counsel, safety-adviser, and insurance review. |
| High | Privacy disclosures are category-level and do not fully reflect the observed vendor/data inventory. | Validate the data map, contracts, retention, rights process, and notice with counsel. |
| High | Retention is configurable from 365 to 3,650 days and defaults to 2,555 days, but an executed deletion/backups/legal-hold process was not established in this review. | Document and test the lifecycle before making stronger claims. |
| High | Support addresses are inconsistent (`admin@faultcite.com` and `support@faultcite.com`) and no staffed commitment is documented. | Name owners, hours, escalation routes, and approved promises. |
| High | Security statements need a dated evidence file and clear separation of current versus planned controls. | Security owner substantiates each statement; counsel reviews marketing risk. |

## Governance acknowledgement evidence

Pending migration `0027_governance_acknowledgement_evidence.sql` adds an append-only acknowledgement record containing:

- organization and authenticated actor identifiers;
- stable document identifier and version;
- SHA-256 hash and exact acknowledgement text; and
- acknowledgement timestamp.

Database triggers reject update and deletion. The existing organization timestamp remains for compatibility/readiness checks. Each accepted settings submission creates a new evidence row and records its identifier, document version, and hash in audit metadata.

This is evidence hardening only. It does not establish contract formation, authority, adequate notice, enforceability, or counsel approval. The current acknowledgement concerns safety responsibility only and must not be described as acceptance of commercial terms or the privacy notice. Counsel and product owners still must decide the approved document set, presentation, checkbox wording, authority representation, re-consent triggers, retention, export, and evidentiary record.

## Approval artifact required to close the legal gate

Retain a dated written statement from licensed counsel listing:

- counsel name, firm, and applicable licensing details;
- confirmed client entity and authorized requester;
- launch locations and factual assumptions;
- exact document filenames/URLs, versions, and hashes reviewed;
- product/data-flow version reviewed;
- approved uses and any conditions or unresolved issues; and
- mandatory re-review triggers, including paid billing, new subprocessors/data categories/locations, or material safety/product changes.

Until that artifact and all stated conditions exist, use **“legal review pending”** or **“draft materials prepared for counsel review.”** Do not use “legally approved,” “compliant,” or “counsel-approved.”

## Packet history

| Packet version | Date | Change |
|---|---|---|
| 1.0 | September 8, 2026 | Initial counsel handoff and acknowledgement-evidence design |
