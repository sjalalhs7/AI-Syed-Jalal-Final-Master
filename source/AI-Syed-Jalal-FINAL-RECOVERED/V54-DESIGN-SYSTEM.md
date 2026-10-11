# AI-Syed Jalal V54 — Design System & Layout Blueprint

## 1. Brand stage
The logo is the visual anchor. The logo asset remains recognizable at all sizes and is presented inside a dimensional orbital stage on the homepage/login rather than being distorted.

## 2. Homepage layout
1. Global top navigation
2. Hero: logo stage + product promise + primary CTA
3. Capability strip: Chat / Research / Code / Data / Documents / Agents
4. Workspace preview cards
5. Operations/security trust section
6. PWA/install prompt area
7. Discovery/content section
8. Compact footer

## 3. Login layout
- Left: 3D brand/workspace presentation
- Right: authentication form
- Live API mode visibly distinct from Demo mode
- No secret/token persisted in localStorage
- Responsive single-column fallback on small screens

## 4. Application layout
- Persistent top bar
- Desktop sidebar
- Main workspace
- Mobile bottom navigation
- Data Vault, Documents, AI Command, Operations, Users, Security and Settings views

## 5. Motion rules
- 3D transforms are decorative, not required for functionality.
- Fine-pointer devices may receive pointer parallax.
- Reduced-motion users receive a static presentation.
- Avoid continuous high-cost animation on large data tables.

## 6. Performance rules
- Keep large record operations paginated/batched.
- Avoid rendering thousands of DOM rows simultaneously.
- Prefer CSS transforms for decorative motion.
- Keep PWA assets cacheable and versioned.

## 7. Responsive rules
- Desktop/PC is the primary data-entry experience.
- Tablet uses compressed navigation and cards.
- Mobile prioritizes navigation, viewing and quick actions.
- Printing always uses a dedicated A4 print surface.
