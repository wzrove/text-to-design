---
"text-to-design-mcp": patch
"text-to-design-ui": patch
---

fix: skip stale top-level nodes in get_page, omit dirty prop getters instead of failing the call, send ungroup as the array the jsDesign engine requires, and stop the false layoutMode "NONE" warning
