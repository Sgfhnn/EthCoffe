const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('model labels have reviewed advice and matching offline audio', () => {
  const labels = JSON.parse(read('model/labels.json'));
  const advice = JSON.parse(read('advice.json'));
  const translations = JSON.parse(read('i18n.json'));
  for (const key of [...labels, 'Uncertain']) {
    assert.equal(advice[key].needsExpertReview, false, key);
    for (const lang of ['am', 'om', 'en']) {
      assert.ok(advice[key][lang]?.name && advice[key][lang]?.steps?.length, `${key}/${lang}`);
      assert.ok(translations[lang]?.officerNote, lang);
      const clip = path.join(root, 'audio', `${key}_${lang}.mp3`);
      assert.ok(fs.statSync(clip).size > 1000, clip);
    }
  }
  assert.match(read('index.html'), /id="savedTitle"/);
});

test('Uncertain saves a photo but never shares the hidden guess', async () => {
  const elements = {ask: {disabled: false}, saved: {textContent: ''}};
  let copied;
  const context = vm.createContext({
    localStorage: {getItem: () => 'en'},
    document: {getElementById: id => elements[id]},
    navigator: {clipboard: {writeText: async text => {copied = text}}},
    File, Blob, console,
    window: {prompt: () => assert.fail('Unexpected copy fallback')}
  });
  vm.runInContext(read('app.js').replace(/init\(\);\s*$/, ''), context);
  vm.runInContext(`
    I18N={en:{saved:'Saved',officerNote:'Please advise.',copyDone:'Copied'}};
    ADV={Uncertain:{en:{name:'Not sure. Ask an officer.'}}};
    last={key:'Uncertain',label:'Leaf_rust',conf:0.91,url:'blob:photo'};
    photoThumbnail=async()=>new Blob(['photo']);
    dbOperation=async(mode,action)=>action({add:record=>{globalThis.savedRecord=record;return {result:1}}});
    renderSaved=async()=>{};
  `, context);
  await vm.runInContext('saveForOfficer()', context);
  assert.equal(context.savedRecord.key, 'Uncertain');
  assert.equal(context.savedRecord.photo.size, 5);
  assert.equal(context.savedRecord.label, undefined);
  assert.equal(context.savedRecord.conf, undefined);
  context.check = {...context.savedRecord, id: 1};
  await vm.runInContext('shareCheck(check)', context);
  assert.match(copied, /Not sure/);
  assert.doesNotMatch(copied, /Leaf_rust|91%/);
});
