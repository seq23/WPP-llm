import fs from 'node:fs';
const req=['data/strategy/citation_strategy_profile.json','data/query_atlas/authority_pillars.json','data/governance/authority_lane_policy.json','data/governance/workflow_ownership_registry.json','data/entities/west_peek_entity_graph.json','docs/strategy/VELOCITY_AUTHORITY_SYSTEM.md'];
const bad=req.filter(x=>!fs.existsSync(x));
const profile=JSON.parse(fs.readFileSync(req[0]));
if(profile.autonomy_mode!=='FULL_SAFE_AUTONOMY') bad.push('autonomy mode');
if((profile.authority_pillars||[]).length!==7) bad.push('authority pillar count');
const graph=JSON.parse(fs.readFileSync(req[4]));
if(!JSON.stringify(graph).includes('westpeekproductions.com/#organization')) bad.push('West Peek stable entity id');
if(bad.length){console.error('Authority system failed:',bad);process.exit(1)}
console.log('Authority system OK: 7 pillars, entity graph, autonomy and ownership contracts');