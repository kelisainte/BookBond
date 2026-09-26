import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const nested=join(root,'.change-history');
const bundles=join(nested,'bundles');
const records=join(nested,'records');
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const mode=process.argv[2];

if(mode==='record') {
  if(git(root,'status','--porcelain')) throw Error('Commit the primary repository before recording a trace');
  mkdirSync(bundles,{recursive:true});mkdirSync(records,{recursive:true});
  if(!existsSync(join(nested,'.git'))) {
    git(nested,'init','-b','main');
    git(nested,'config','user.name','BookBonds Trace');
    git(nested,'config','user.email','trace@bookbonds.invalid');
  }
  const commit=git(root,'rev-parse','HEAD');
  const name=commit.slice(0,12);
  const bundle=join(bundles,`${name}.bundle`);
  if(existsSync(bundle)) throw Error(`Commit ${name} is already recorded`);
  execFileSync('git',['bundle','create',bundle,'--all'],{cwd:root});
  git(root,'bundle','verify',bundle);
  const migrations=readdirSync(join(root,'db')).filter(file=>file.endsWith('.sql')).sort().map(file=>({file,sha256:digest(join(root,'db',file))}));
  const record={schemaVersion:1,primaryCommit:commit,createdAt:new Date().toISOString(),bundle:`bundles/${name}.bundle`,bundleSha256:digest(bundle),migrations,environmentNames:['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','DATABASE_URL','SUPABASE_SECRET_KEY']};
  writeFileSync(join(records,`${name}.json`),JSON.stringify(record,null,2)+'\n');
  git(nested,'add','bundles','records');
  git(nested,'commit','-m',`Trace primary commit ${name}`);
  console.log(`Recorded ${commit} in the nested .change-history repository`);
} else if(mode==='verify') {
  if(!existsSync(join(nested,'.git'))) throw Error('No local history exists yet; run npm run trace after a primary commit');
  const files=readdirSync(records).filter(file=>file.endsWith('.json'));
  for(const file of files) {
    const record=JSON.parse(readFileSync(join(records,file),'utf8'));
    const bundle=join(nested,record.bundle);
    if(digest(bundle)!==record.bundleSha256) throw Error(`Bundle checksum mismatch: ${file}`);
    git(root,'bundle','verify',bundle);
  }
  if(git(nested,'status','--porcelain')) throw Error('Nested history has uncommitted changes');
  console.log(`Verified ${files.length} nested history records and Git bundles`);
} else if(mode==='recover') {
  const recordName=process.argv[3],destination=process.argv[4];
  if(!/^[0-9a-f]{12}$/.test(recordName??'')||!destination) throw Error('Usage: node scripts/trace.mjs recover <12-character commit prefix> <new destination>');
  const record=JSON.parse(readFileSync(join(records,`${recordName}.json`),'utf8'));
  const bundle=join(nested,record.bundle);
  if(digest(bundle)!==record.bundleSha256) throw Error('Bundle checksum mismatch');
  const target=resolve(destination);
  if(existsSync(target)) throw Error('Recovery destination must not exist');
  execFileSync('git',['clone',bundle,target],{cwd:root,stdio:'inherit'});
  console.log(`Recovered repository to ${target}; inspect it before switching production refs`);
} else throw Error('Usage: node scripts/trace.mjs record|verify|recover');
