<!-- IntMap PR — keep changes additive; do not delete/shrink existing features without explicit intent. -->

## What & why

<!-- One or two sentences. Link the request/issue if any. -->

## Checklist

- [ ] `npm test` passes locally (static checks + browser smoke + internal QA)
- [ ] Change is additive / in-place — no unrelated refactors, no feature removal
- [ ] All 5 languages handled if UI/replies changed (EN / JP / DE / RU / ES)
- [ ] New feature wired into Atlas (dispatch + catalogs) if applicable
- [ ] Sources / terms / privacy updated if a data source changed
- [ ] The page still RUNS (≈130 layer rows, key `window.IntMap*` defined) — smoke covers this
- [ ] Eyeballed on staging (local `npm run serve` or a `*.pages.dev` preview)

## Notes for the reviewer

<!-- Anything external-API-dependent, anything that needs manual GitHub/Sentry/Cloudflare steps. -->
