# AI-Syed-Jalal V122 — Master Merge

## Base
AI-Syed-Jalal V121-FIXED-current

## Preservation rule
The original V121 tree is preserved. New repository source is added under `integrations/upstream/` rather than overwriting same-name paths.

## Integrated source sets
1. AgentScope
2. MedicalGPT
3. Awesome LLM Apps
4. OpenEMR
5. Superpowers

## AI Widget
The V122 reusable widget is available globally through `frontend/components/AIWidget/AIWidget.js` and routes API access through `frontend/config/api.js`.

## Important
This package intentionally does not claim that Python/PHP repositories have been converted into the Node runtime. They are preserved as isolated integration sources until service adapters are implemented and validated. This avoids destructive dependency conflicts.
