import fs from 'node:fs';
const c=JSON.parse(fs.readFileSync('data/contracts/artifact_consistency_contract.json'));
const bad=[]; for(const a of c.artifacts.filter(x=>x.required_in_zip&&!x.path.includes('*'))) if(!fs.existsSync(a.path)) bad.push(a.path);
if(fs.existsSync('node_modules')) console.warn('[packaging-parity] node_modules present in working tree; baseline packager must exclude it');
if(bad.length){console.error('Packaging parity failed:',bad);process.exit(1)} console.log('Packaging parity OK: canonical ZIP-required artifacts present');