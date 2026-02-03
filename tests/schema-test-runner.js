const fs = require('fs');
const path = require('path');

function fail(msg){
  console.error('FAIL:', msg);
  process.exitCode = 1;
}

const dir = path.join(__dirname, '..', 'contracts', 'v1');
if(!fs.existsSync(dir)) fail(`Contracts directory not found: ${dir}`);

const files = fs.readdirSync(dir).filter(f=>f.endsWith('.json'));
if(files.length===0) fail('No schema files found in contracts/v1');

files.forEach(f=>{
  const p = path.join(dir, f);
  try{
    const raw = fs.readFileSync(p,'utf8');
    const obj = JSON.parse(raw);
    if(obj.additionalProperties!==false) fail(`${f}: additionalProperties must be false`);
    if(!obj.$schema) console.warn(`${f}: missing $schema`);
    console.log(`OK: ${f}`);
  }catch(e){
    fail(`${f}: parse error ${e.message}`);
  }
});

if(process.exitCode===1) process.exit(1);
console.log('All schema checks passed.');
