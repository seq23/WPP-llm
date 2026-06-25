#!/usr/bin/env node
const profile = (process.argv[2] || process.env.RELEASE_EXECUTION_ENV || 'local').toUpperCase();
const normalized = profile.includes('LOCAL') ? 'LOCAL' : profile;
console.log(`release:prepush profile: ${normalized}`);
