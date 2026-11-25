## Summary

- Linked issue: `Closes #`
- What changed and why:

## Verification

- [ ] `npm test` (`node --test tests/*.test.mjs`) passes locally
- [ ] `npm run dogfood` passes locally
- [ ] Pack files stay strictly single-language separated (`packs/common` & `packs/en` pure English; `packs/zh` pure Chinese) and `prompts/*.md` contain no internal kernel schema keys
- [ ] No credentials, workstation paths, or private repository details are included
