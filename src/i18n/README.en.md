# Interface languages

[简体中文](README.md) | English

The interface is written in Simplified Chinese. Other languages are text tables keyed by the Simplified Chinese originals (`locales/*.json`), applied to the page by the text replacer the plugins also use (`src/plugins/text.ts`), with plugin text tables on top. Text that never reaches the page (system dialogs, the menu bar menu) is translated with `tr()`; dates and numbers use the formatting functions in `index.ts`, following each language's conventions.

## Adding or changing interface text

1. Write Simplified Chinese in the code as usual. The `${…}` / `{…}` parts of template strings and JSX become placeholders `{a}`, `{b}`, …
2. Run `node scripts/i18n.mjs` to list the text each language lacks.
3. Run `node scripts/i18n.mjs --hant` to fill in Traditional Chinese automatically (OpenCC, Taiwan usage) and drop entries no longer in the source. Traditional Chinese translations edited by hand are kept.
4. Add the translations to `en.json`, `ja.json` and `ko.json`, keeping the placeholders as they are.

`pnpm test` checks that every language has all the text, with the same placeholders.

- The user's content (lyrics, song titles, file names and so on) sits in elements with the `data-lp-raw` attribute and isn't translated.
- Chinese that isn't interface text (such as the recognition model's prompts or the browser preview's sample data) is wrapped in `i18n-ignore-start` / `i18n-ignore-end` comments.
- Don't use "·" in interface text.
