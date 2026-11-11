import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,copyFileSync,rmSync,symlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const testRoot=path.dirname(fileURLToPath(import.meta.url));
const buildSource=fileURLToPath(new URL('../scripts/build-netlify.mjs',import.meta.url));
function fixture() {
  const root=mkdtempSync(path.join(testRoot,'.racker-test-build-'));
  mkdirSync(path.join(root,'scripts'));
  copyFileSync(buildSource,path.join(root,'scripts/build-netlify.mjs'));
  for(const f of ['index.html','app.js','styles.css'])writeFileSync(path.join(root,f),'source-'+f);
  writeFileSync(path.join(root,'.env'),'TEST_PRIVATE_VALUE=not-for-publication');
  return root;
}
function run(root) {
  return spawnSync(process.execPath,['--preserve-symlinks-main','--preserve-symlinks','scripts/build-netlify.mjs'],{cwd:root,encoding:'utf8'});
}
test('build remove artefatos antigos do cache e publica somente os arquivos permitidos',()=>{
  const root=fixture();
  try {
    mkdirSync(path.join(root,'dist','stale'),{recursive:true});
    writeFileSync(path.join(root,'dist','stale','private.txt'),'must-not-be-published');
    writeFileSync(path.join(root,'dist','old.html'),'stale-page');
    const result=run(root);
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(readdirSync(path.join(root,'dist')).sort(),['app.js','index.html','styles.css']);
    assert.equal(readFileSync(path.join(root,'dist','index.html'),'utf8'),'source-index.html');
    assert.equal(readFileSync(path.join(root,'.env'),'utf8'),'TEST_PRIVATE_VALUE=not-for-publication');
    assert.equal(run(root).status,0,'O segundo build também deve funcionar.');
  } finally { rmSync(root,{recursive:true,force:true}); }
});
test('build recusa dist apontando para outra pasta',()=>{
  const root=fixture();
  try {
    const other=path.join(root,'other');mkdirSync(other);
    writeFileSync(path.join(other,'keep.txt'),'keep');
    symlinkSync(other,path.join(root,'dist'),process.platform==='win32'?'junction':'dir');
    const result=run(root);
    assert.notEqual(result.status,0);
    assert.equal(readFileSync(path.join(other,'keep.txt'),'utf8'),'keep');
  } finally { rmSync(root,{recursive:true,force:true}); }
});
