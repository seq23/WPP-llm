#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_redirects');
const lines = [
  '# Canonical policy: clean URLs are canonical.',
  '# Do NOT redirect clean URLs to .html. Most static hosts strip .html automatically;',
  '# adding reverse redirects creates ERR_TOO_MANY_REDIRECTS on navigation.',
  '# Only legacy aliases that do not point to .html are allowed here.',
  '/virtual-event-production-for-nonprofit /virtual-event-production-for-nonprofits 301',
  '/virtual-event-production-for-nonprofit.html /virtual-event-production-for-nonprofits 301',
  ''
];
fs.writeFileSync(OUT, lines.join('\n'));
console.log('Updated _redirects with clean-canonical anti-loop policy.');
