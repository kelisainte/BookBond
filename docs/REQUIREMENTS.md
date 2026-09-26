# Blueprint v3 coverage — September 2026

Status vocabulary: **built** means implemented in code and exercised by build/schema checks; **partial** means a functional vertical slice exists but the full policy or workflow is not complete; **gated** means intentionally unavailable pending a real provider, rights, policy or physical process. None implies a live pilot or production certification.

| Blueprint section | Status | Current implementation and remaining work |
| --- | --- | --- |
| 1 Language and boundaries | Built | Work/edition/copy, Bond vs loan vs gift, passport vs Leaflet journal; no simulated money. |
| 2 Principles and audiences | Partial | Text and keyboard paths, specific-copy cards and reading without trade; user research remains. |
| 3 Site map and first use | Partial | Explore, shelves, Bonds, Room, reading, circles, messages, rewards, settings, login; public sample Room and guided checklist remain. |
| 4 Catalog and listing | Partial | Unique copy ID, ISBN-assisted edition, manual entry, private actual-photo upload, condition, draft and listing terms; scanner, catalog integrations and rich edition correction remain. |
| 5 Smart shelves/binders | Partial | Derived Current/Away/Borrowed/Pending/Ghost/history and binders; reorder, audience inheritance and Homecoming period UI remain. |
| 6 Discovery/Bond Finder | Partial | Real available listing search/filter, offer from actual copies; reciprocal ranking, daily Deck, geographic distance and interest signal remain. |
| 7 Bonds and Bond Table | Partial | Two acceptances, frozen copy/photo snapshot, lock and reserve, distinct delivery legs, dual recipient receipt, atomic settlement and cancellation before dispatch. Counteroffers, amendments, visual multi-copy table and adjudicated resolution remain. |
| 8 Loans/Routes | Partial | Owner/holder separation and confirmed return; notice rules, extension, overdue case automation and circle custody routes remain. |
| 9 Shipping/protection | Gated | Local meetup only, case intake and paused settlement. Provider costs, tracking, protection and adjudication require partners and rules. |
| 10 Passport/BondSpine | Partial | Append-only events and consent-filtered copy timeline, journey note data model; richer path visualization and consent workflows remain. |
| 11 NFC/offline | Gated | Tag records and uniqueness constraint; kits, authenticated tap verification and evidence-backed claim workflow remain. |
| 12 Cards/game | Partial | Interactive rotating CSS 3D book, actual-photo surface or generic art, binder data; material-backed mesh, game cosmetics and quests remain. |
| 13 Reader's Rooms | Partial | Editable spatial scene, props, 3D book placement, undo, autosave, draft/publish versions, private/public audience, visitor filtering; glTF renderer, creator workshop and asset moderation remain. |
| 14 Reading/circles | Partial | Reading states, goals via log, wishlist, circle create/join/post, spoiler reveal; routes, prompts, moderation, Yearbook remain. |
| 15 Leaflets | Partial | Balanced event-keyed journal and account statement; approved spend catalog, pending/holds, thresholds and reconciliation remain. |
| 16 Partner e-books | Gated | No entitlements offered without rights, inventory, territory and fulfillment provider. |
| 17 Login/security | Partial | Cookie backed Supabase email OTP, `getUser` checks, private media proxy, transactional permission checks; passkeys, MFA, session management, rate limiting and incident playbooks remain. |
| 18 Reader settings | Partial | Editable profile, visibility, discovery radius, theme, motion/sound, copy audience, Room draft and listing edits; export, deletion, notification controls and recovery remain. |
| 19 Portals/roles | Partial | Reader and scoped staff roles in schema; partner and dedicated operational portals remain. |
| 20 Admin control center | Partial | Case queue, privileged read audit, cross-entity search, versioned normal policies and case review; approval composer, full domains, field scopes, role grants and break-glass remain. |
| 21 Trust/privacy | Partial | Audience filters, private evidence, blocks, case intake, no authenticity badge; moderation queues, appeals, retention policy and abuse detection remain. |
| 22 Three records | Partial | Passport and double-entry Leaflet journal; real-money system disabled pending provider. Outbox/projection worker remains. |
| 23 Conceptual model | Partial | 32 core tables and constraints; shipping, payment references, entitlements, route queue and approvals remain. |
| 24 Service boundaries | Partial | Server commands and views separate core domains; background workers, notifications and search index remain. |
| 25 3D build process | Partial | CSS 3D book and editable spatial scene with text controls; asset pipeline, textures and performance testing remain. |
| 26–27 Build process/stages | Partial | Foundation and exchange vertical slices implemented; real user pilot, gate verification and operations remain. |
| 28 Acceptance scenarios | Partial | Schema and build checks plus manual flow design; automated end-to-end two-account concurrency and accessibility testing remain. |
| 29–30 Growth/open decisions | Gated | No unvalidated economics or promises. Product owner must resolve geography, age, providers, policies and rights. |
| 31–34 Extended features/runbooks/invariants | Partial | Core identity, dual handoff, append-only events, media privacy and balanced awards; Bond Rings, Atlas, Bondloom, advanced routes, runbooks and external approver remain. |
| 35 Visual system | Partial | Warm paper, ink, oxblood, moss, brass, serif book titles, responsive layout, keyboard control and reduced motion CSS. Formal design token package and usability validation remain. |
| 36 Sources | Documented | Dossier is the source. Product and partner assertions are not represented as live. |

## Demo walkthrough

With two real test accounts in a dedicated staging project: create profiles, register copies and upload front/back/spine photos, publish both as Open to Bond, submit an offer with exact copy IDs, have the recipient accept, mark each outgoing leg handed over, confirm each incoming leg separately, inspect Current and Ghost shelves plus passport and Leaflet journal. Then create a separate loan, confirm the handoff and return. Decorate a Room, publish, visit from the second account and verify hidden books do not appear.
