# AI-Syed-Jalal — Master Visual Definition
## Visual Source-of-Truth / Design Continuity Specification

**Document status:** MASTER VISUAL DEFINITION  
**Target lineage:** V120+ / V125 visual continuation  
**Engineering baseline:** V100 FINAL COMPLETE MASTER  
**Purpose:** Preserve the approved visual identity and define every visual element precisely enough for future implementation, comparison, QA, and regression review.

---

# 1. CORE RULE

The approved visual design is **LOCKED**.

Future work must:
- preserve the existing Login Page;
- preserve the existing Homepage;
- preserve the approved Logo system;
- preserve established visual hierarchy;
- add functionality without unnecessary redesign;
- never replace a working visual pattern merely because a newer framework or trend exists;
- treat supplied reference photographs/screenshots as the visual source of truth whenever they are available.

**No redesign-by-default.**

If a new feature requires a visual change, the change must be additive and must preserve the established design language.

---

# 2. TRUTH STATUS

### VERIFIED FROM PROJECT RECORDS

The maintained project lineage records confirm:

- separate Login shell;
- authenticated App shell;
- dedicated Homepage;
- Profile/Settings workflow;
- dedicated Web logo;
- dedicated App/PWA logo;
- PWA manifest logo wiring;
- Login → authenticated workspace flow;
- 14 navigation targets/views in the V100 baseline;
- 3,500 skills across 35 domains;
- 120 catalog roles;
- 303 Agency specialist profiles;
- 16 Agency tool targets;
- OpenCode integration contract;
- Android IDE integration contract.

V100 is documented as the final source/regression master for its release lineage.

### NOT YET PROVEN FROM PHYSICAL RUNTIME

The project audit explicitly distinguishes source/regression PASS from real-world deployment verification.

Still requiring physical/runtime verification:
- live PostgreSQL production deployment;
- real external AI provider calls and fallback;
- physical Chromium/browser click execution;
- real Android-device installation/E2E;
- Windows/VPS production deployment;
- physical re-test of the separate historical ~220 MB source archive.

These must never be represented as completed merely because a source-level test passes.

---

# 3. VISUAL MASTER PRINCIPLES

## 3.1 Identity
AI-Syed-Jalal must feel like one coherent platform, not a collection of unrelated dashboards.

## 3.2 Hierarchy
Every screen must clearly distinguish:
1. primary action;
2. page identity;
3. current context;
4. secondary actions;
5. system status;
6. supporting information.

## 3.3 Consistency
Buttons, cards, inputs, navigation, dialogs, badges, status indicators, typography, spacing, and motion must reuse shared patterns.

## 3.4 Premium technical character
The interface should communicate:
- advanced AI;
- engineering quality;
- reliability;
- controlled power;
- professional software;
- modern visual depth.

Avoid visual noise, gratuitous gradients, excessive glow, and decorative elements that do not improve comprehension.

---

# 4. LOGIN PAGE — LOCKED VISUAL CONTRACT

The Login Page is a primary identity surface.

It must preserve:

### Structure
- dedicated unauthenticated shell;
- clear brand/logo zone;
- authentication panel;
- strong visual separation between branding and credentials;
- obvious primary login action;
- readable error/success feedback;
- responsive mobile layout.

### Interaction
- email/username field;
- password field;
- password visibility control where present;
- primary Login action;
- loading state;
- validation state;
- authentication failure state;
- successful transition to the authenticated workspace.

### Visual QA
Future changes must compare against the approved reference image/screenshot for:
- logo position;
- panel dimensions;
- alignment;
- typography hierarchy;
- button proportions;
- field height;
- spacing;
- background treatment;
- visual balance.

---

# 5. HOMEPAGE — LOCKED VISUAL CONTRACT

The Homepage is a dedicated first-class view.

It must remain visually distinct from the authenticated application workspace.

### Required qualities
- immediate AI-Syed-Jalal identity;
- strong hero/intro area;
- clear primary navigation;
- clear call-to-action;
- premium AI/technology atmosphere;
- responsive layout;
- coherent motion;
- fast visual comprehension.

### Animation rule
Animation must support:
- depth;
- orientation;
- state;
- interaction;
- perceived responsiveness.

Animation must NOT:
- block navigation;
- reduce accessibility;
- create motion sickness;
- continuously consume excessive CPU/GPU;
- hide essential information.

---

# 6. LOGO SYSTEM

The project has separate Web and App/PWA logo assets.

### Web logo
Canonical asset:
`frontend/assets/web-logo.svg`

### App/PWA logo
Canonical asset:
`frontend/assets/app-logo.svg`

### Logo rules
- never distort aspect ratio;
- never arbitrarily recolor the approved logo;
- maintain clear space;
- preserve legibility at small sizes;
- use the appropriate Web/App asset for its target surface;
- do not create competing alternate logos without an explicit brand decision.

---

# 7. APPLICATION SHELL

The authenticated shell must provide a stable visual frame for all platform capabilities.

### Core regions
- global navigation;
- page title/context;
- main content;
- contextual actions;
- system status;
- profile/settings access;
- responsive mobile navigation.

The shell should remain stable while individual modules change.

---

# 8. COMPONENT VISUAL SYSTEM

## Buttons
Define and reuse:
- primary;
- secondary;
- tertiary/ghost;
- destructive;
- disabled;
- loading;
- success.

## Inputs
Every input requires:
- label;
- focus state;
- error state;
- disabled state;
- accessible contrast;
- consistent height and radius.

## Cards
Cards should communicate grouping, not merely decoration.

Use consistent:
- radius;
- border;
- shadow/depth;
- internal padding;
- heading hierarchy;
- status treatment.

## Status
Use consistent semantic states:
- success;
- warning;
- error;
- informational;
- unavailable;
- loading.

---

# 9. AI PLATFORM VISUAL LANGUAGE

AI-Syed-Jalal contains many advanced capabilities. Their visual treatment must still belong to one system.

Applicable surfaces include:
- AI Assistant;
- Agent Factory;
- Mission Orchestrator;
- Agency;
- AI Gateway / OmniRoute;
- Knowledge/RAG;
- Tool execution;
- Automation;
- Voice;
- Screen/Webcam awareness;
- Skills;
- Developer/IDE integrations;
- Analytics;
- Security;
- Profile/Settings.

Each module may have its own information architecture, but must reuse the global design language.

---

# 10. SKILLS VISUALIZATION

The project inventory includes:

**3,500 skills / 35 domains**

The visual representation should make the scale understandable without overwhelming the user.

Recommended hierarchy:
- domain;
- skill category;
- individual skill;
- capability;
- availability/status;
- execution context.

Avoid displaying thousands of items as one flat list.

---

# 11. AGENT VISUALIZATION

The project maintains:
- 120 catalog roles;
- 303 Agency specialist profiles;
- 16 Agency tool targets.

Agent UI should clearly distinguish:
- built-in role;
- custom agent;
- active/inactive;
- capability;
- tool access;
- execution state;
- history/trace;
- errors/recovery.

Agent execution must look powerful but controlled.

---

# 12. OMNIROUTE VISUAL DEFINITION

OmniRoute is treated as an AI gateway concept.

Visual areas:
- provider list;
- health state;
- routing policy;
- fallback chain;
- cost/usage;
- request status;
- model/provider selection;
- chat/image/embedding API categories.

Health states must be immediately understandable.

Do not imply a provider is healthy merely because it is configured.

---

# 13. KNOWLEDGE / RAG VISUAL DEFINITION

Knowledge interfaces should distinguish:
- source;
- chunk;
- retrieval method;
- semantic retrieval;
- lexical fallback;
- indexing state;
- ownership/visibility;
- audit status.

The UI must never visually claim semantic/vector retrieval when the runtime actually used lexical fallback.

---

# 14. SECURITY VISUAL LANGUAGE

Security states should be calm, explicit, and understandable.

Expose when relevant:
- authenticated;
- session protected;
- permission denied;
- CSRF failure;
- rate limited;
- tool blocked;
- provider unavailable;
- suspicious/unsafe request blocked.

Do not use alarming visual effects for ordinary security controls.

---

# 15. RESPONSIVE DESIGN

The visual definition must work across:

### Desktop
- wide workspace;
- multi-column layouts where useful;
- persistent navigation where appropriate.

### Tablet
- compressed navigation;
- adaptive grids;
- preserved hierarchy.

### Mobile
- single-column priority;
- touch-friendly controls;
- bottom/sheet navigation where appropriate;
- no horizontal overflow;
- readable typography;
- preserved Login/Homepage identity.

---

# 16. ACCESSIBILITY

Every visual implementation must consider:
- keyboard navigation;
- visible focus;
- semantic labels;
- sufficient contrast;
- reduced motion;
- readable text size;
- touch target size;
- error messages that do not rely only on color.

Accessibility is part of the design, not a later patch.

---

# 17. MOTION SYSTEM

Motion levels:

### Level 0 — static
For:
- dense data;
- logs;
- security records;
- technical tables.

### Level 1 — micro-interaction
For:
- hover;
- focus;
- button feedback;
- status transition.

### Level 2 — contextual
For:
- panel opening;
- route transition;
- dashboard state changes.

### Level 3 — hero/brand
Reserved for:
- Homepage;
- brand presentation;
- controlled 3D/ambient visuals.

Level 3 motion must never dominate core usability.

---

# 18. VISUAL QA / PHOTO COMPARISON PROTOCOL

When a reference photo/screenshot is available, compare:

1. overall composition;
2. logo position and scale;
3. header/navigation;
4. hero proportions;
5. card positions;
6. typography hierarchy;
7. button placement;
8. field dimensions;
9. spacing;
10. border/radius;
11. shadows;
12. gradients;
13. background;
14. 3D/depth;
15. animation cues;
16. responsive behavior.

### Acceptance rule

A future implementation is not considered visually equivalent merely because it contains the same text/components.

It must preserve the **visual relationship** between those elements.

---

# 19. CHANGE CONTROL

Any proposed visual change must answer:

- What problem does it solve?
- Why can't the existing pattern solve it?
- Does it affect Login?
- Does it affect Homepage?
- Does it affect the Logo?
- Does it affect responsive behavior?
- Does it introduce a new component pattern?
- Can the existing component be reused instead?

If there is no strong reason to change the visual system:

**DO NOT CHANGE IT.**

---

# 20. VERSION / LINEAGE RULE

The historical engineering records currently establish V100 as the final source/regression master for that release lineage.

Therefore:

- V100 remains the engineering baseline;
- V120+ / V125 should be treated as the user's requested future visual/product lineage;
- V120/V125 must not be falsely presented as verified release records unless corresponding artifacts/tests exist;
- visual documentation can target V125 without inventing a completed V125 build;
- every future release should preserve the visual master unless an explicit redesign is approved.

---

# 21. FINAL VISUAL LOCK

## LOCKED
- Login identity
- Homepage identity
- Logo identity
- Web/App visual relationship
- Overall AI-Syed-Jalal design language
- Existing approved visual hierarchy
- Existing approved visual assets

## EXTENDABLE
- new AI modules;
- new agents;
- new automation;
- new skills;
- new dashboards;
- new integrations;
- new developer tools;
- new analytics;
- new security controls.

## NEVER ASSUME
- source-level PASS = production PASS;
- a new version number = a verified build;
- a component list = visual equivalence;
- a generic AI dashboard = the approved AI-Syed-Jalal design.

---

# 22. FINAL ACCEPTANCE STATEMENT

This document defines the **AI-Syed-Jalal Master Visual Continuity Contract**.

Its purpose is not to redesign the project.

Its purpose is to ensure that the approved visual identity survives future engineering work.

**The rule is simple:**

> Add capability. Preserve identity.  
> Improve usability. Preserve recognition.  
> Fix defects. Do not redesign unnecessarily.  
> Verify what is real. Label what is not yet verified.

---

## Source Boundary

This specification incorporates the verified project records available in the current project library, including the V98 Web/App integration record and V100 final master audit.

It does **not** claim pixel-level extraction of photographs that are not currently available as readable image assets.
