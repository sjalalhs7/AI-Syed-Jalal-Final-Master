# V122 Merge Notes

V122 uses V121 as the production base and preserves the complete V121 source tree.

The additional Library repositories are included as complete source trees under `integrations/upstream/` so original files, licenses, examples and documentation are not silently discarded.

Because these projects use incompatible runtimes (Node.js, Python and PHP), their package managers are intentionally NOT collapsed into V121's Node package.json. Doing that would create dependency and runtime conflicts rather than a production merge.

A reusable AI Widget was added as a Shadow-DOM web component:
- `frontend/components/AIWidget/AIWidget.js`
- `frontend/components/AIWidget/AIWidget.css`
- `frontend/config/api.js`

The original V121 `frontend/assets/ai-widget.js` is preserved. The V122 widget is additive and namespaced.
