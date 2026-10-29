import test from 'node:test';
import assert from 'node:assert/strict';
import { abbProfile as model, ABB_PROFILE_ID } from '../src/abb-profile.js';
import { stageBundledModel, withBundledModels } from '../src/bundled-models.js';
import { initialValues, validateModel, issues, blocked, reconcile, orderCode, clone } from '../src/engine.js';
import { configurationText, configurationRows, outputLabel } from '../src/configuration-summary.js';
import { normalizeProposal, makeRequest } from '../server/ai.mjs';

// A complete quote request, deliberately not a default or asserted part number.
export const quoteValues = {
  size:'0050',connection:'A1',flange_material:'C',liner:'T1',electrode_design:'1',electrode_material:'S',
  grounding:'2',grounding_rings:'A',approval:'Y0',housing:'D2',temperature_design:'TK1',
  power:'C',display:'2',outputs:'G0',card_one:'DR0',card_two:'DS0',ethernet_protocol:'',
  calibration:'RCD',test_points:'TV2',calibration_certificate:'CMA',certificates:[]
};
const quote = (changes={}) => ({...clone(quoteValues),...changes});
const hasConflict = values => issues(model,values).length > 0;

test('ABB is a source-backed unselected RFQ draft, and a complete quote request validates',()=>{
  assert.deepEqual(validateModel(model),[]);
  assert.equal(model.status,'draft');assert.equal(model.outputMode,'rfq');
  assert.equal(model.sourceReferences[0].published,'2025-10');
  assert(model.fields.every(f=>f.codeOrder===0&&f.options.every(o=>o.sourcePage)));
  assert(model.rules.every(r=>r.sourcePage));
  assert(issues(model,initialValues(model)).length>10);
  assert.deepEqual(issues(model,quote()),[]);
  assert.equal(orderCode(model,quote()),'RFQ ONLY — manufacturer part number pending');
  const malicious=clone(model);malicious.fields[0].codeOrder=1;
  assert.equal(orderCode(malicious,quote()),orderCode(model,quote()));
});

test('documented DN and liner boundaries survive the full scoped size/liner matrix',()=>{
  const bounds={T1:[15,600],P1:[15,200],E1:[25,600],R2:[25,600],R4:[50,600],T2:[25,300]};
  for(const size of model.fields.find(f=>f.id==='size').options)for(const [liner,[min,max]] of Object.entries(bounds)){
    const valid=Number(size.code)>=min&&Number(size.code)<=max;
    assert.equal(hasConflict(quote({size:size.code,liner})),!valid,`DN ${size.code}, ${liner}`);
  }
  assert(blocked(model,quote({size:'0015'}),'flange_material','B').length);
  assert.equal(blocked(model,quote({size:'0020'}),'flange_material','B').length,0);
  assert(hasConflict(quote({size:'700'}))); // Out-of-profile sizes cannot bypass validation.
});

test('PN63/100 require DN25–200 hard rubber; ASME150/300 retain scoped sizes',()=>{
  for(const connection of ['D5','D6']){
    for(const [size,liner,valid] of [['0020','R2',false],['0025','R2',true],['0200','R2',true],['0250','R2',false],['0050','T1',false]]){
      assert.equal(hasConflict(quote({connection,size,liner})),!valid,`${connection} ${size} ${liner}`);
    }
  }
  for(const connection of ['A1','A3'])assert.deepEqual(issues(model,quote({connection,size:'0600'})),[]);
});

test('grounding, pointed electrodes and high-temperature design honor material and size limits',()=>{
  assert(hasConflict(quote({size:'0040',grounding:'3'})));
  assert.deepEqual(issues(model,quote({size:'0050',grounding:'3'})),[]);
  assert(hasConflict(quote({size:'0450',electrode_design:'5'})));
  assert.deepEqual(issues(model,quote({size:'0400',electrode_design:'5'})),[]);
  for(const liner of ['R2','R4']){
    assert(hasConflict(quote({liner,grounding_rings:'B'})));
    assert(hasConflict(quote({liner,temperature_design:'TKH'})));
  }
  for(const liner of ['T1','T2','E1','P1'])assert.deepEqual(issues(model,quote({liner,grounding_rings:'C',temperature_design:'TKH'})),[]);
  const result=reconcile(model,quote({size:'0400',liner:'P1'}));
  assert.equal(result.values.liner,'');assert(result.removed.length);
});

test('housing, Ex and communication/card dependencies reject incompatible combinations',()=>{
  assert(hasConflict(quote({approval:'A1',housing:'S1'})));
  assert.deepEqual(issues(model,quote({approval:'A1',housing:'D1'})),[]);
  assert(hasConflict(quote({certificates:['CS'],housing:'S2'})));
  assert.deepEqual(issues(model,quote({certificates:['CS'],housing:'D2'})),[]);
  for(const [outputs,card_one] of [['M1','DRM'],['D1','DRD'],['E2','DR6'],['E3','DR6']]){
    const values=quote({outputs,card_one,housing:'S1',ethernet_protocol:'GCM'});
    assert.deepEqual(issues(model,values),[]);
    assert(hasConflict({...values,card_one:'DR0'}));
    assert(hasConflict({...values,card_one:''}));
    if(outputs.startsWith('E')){
      assert(hasConflict({...values,housing:'D1'}));
      assert(hasConflict({...values,approval:'A1'}));
      assert(hasConflict({...values,ethernet_protocol:''}));
      for(const approval of ['Y0','A2','F2'])assert.deepEqual(issues(model,{...values,approval}),[]);
    }
  }
});

test('changing protocol stays possible and clears the previous card without resetting other fields',()=>{
  for(const [outputs,card_one] of [['M1','DRM'],['D1','DRD'],['E2','DR6']]){
    const before=quote({outputs,card_one,housing:'S2',ethernet_protocol:'GCM'});
    assert.deepEqual(blocked(model,before,'outputs','G0'),[]);
    const after=reconcile(model,{...before,outputs:'G0'}).values;
    assert.equal(after.outputs,'G0');assert.equal(after.card_one,'');assert.equal(after.size,before.size);
    assert.deepEqual(issues(model,{...after,card_one:'DR0'}),[]);
    assert(!configurationRows(model,after).some(([label])=>label==='Ethernet protocol request'));
  }
});

test('optional digital cards obey maximum quantities, while two analog outputs remain allowed',()=>{
  assert(hasConflict(quote({card_one:'DRN',card_two:'DSN'})));
  assert(hasConflict(quote({card_one:'DRG',card_two:'DSG'})));
  assert.deepEqual(issues(model,quote({card_one:'DRA',card_two:'DSA'})),[]);
  assert.deepEqual(issues(model,quote({card_one:'DRN',card_two:'DSG'})),[]);
});

test('calibration accuracy and certificate requests enforce test-point requirements',()=>{
  assert(hasConflict(quote({calibration:'RCE',test_points:'TV2'})));
  assert.deepEqual(issues(model,quote({calibration:'RCE',test_points:'TV3'})),[]);
  assert(hasConflict(quote({calibration_certificate:'CMD',test_points:'TV3'})));
  assert.deepEqual(issues(model,quote({calibration:'RCE',calibration_certificate:'CMD',test_points:'TV5'})),[]);
});

test('RFQ exports carry readable choices, source URLs, missing application data and no counterfeit order',()=>{
  const text=configurationText(model,quote());
  assert.match(text,/REQUEST FOR QUOTATION — NOT A MANUFACTURER PART NUMBER/);
  assert.match(text,/Meter size: DN 50 \(2 in\) \(0050\)/);
  assert.match(text,/APPLICATION DATA TO SUPPLY/);
  for(const word of ['conductivity','maximum flow','operating pressure','temperature','application suitability','nameplate'])assert(text.includes(word));
  assert(text.includes(model.sourceUrl));assert(text.includes(model.revision));
  assert(!text.includes('FEP631 Y0'));
  assert.equal(outputLabel(model),'RFQ CONFIGURATION');
  assert.match(configurationText(model,initialValues(model)),/Open issues:/);
});

test('bundled addition is additive, isolated, and rejects every existing lifecycle state',()=>{
  const existing=[{id:'customer-model',name:'Customer data',status:'active',custom:{keep:true}}],original=clone(existing);
  const draft=stageBundledModel(existing,ABB_PROFILE_ID);
  assert.equal(draft.status,'draft');assert.deepEqual(existing,original);
  draft.fields[0].label='Changed';assert.notEqual(model.fields[0].label,'Changed');
  for(const status of ['draft','active','inactive'])assert.throws(()=>stageBundledModel([{...clone(model),status}],ABB_PROFILE_ID),/already in your catalog/);
  assert.throws(()=>stageBundledModel(existing,'unknown'),/Unknown bundled/);
  const seeded=withBundledModels(existing);assert.deepEqual(seeded[0],original[0]);assert.equal(seeded[1].status,'draft');
  assert.deepEqual(withBundledModels(seeded),seeded);
  const custom={...clone(model),name:'Reviewed customer ABB',status:'active'};
  assert.deepEqual(withBundledModels([custom]),[custom]);
});

test('AI proposals cannot silently remove RFQ semantics or its provenance and checklist',()=>{
  const proposed=clone(model);delete proposed.outputMode;delete proposed.sourceReferences;delete proposed.applicationReview;
  const normalized=normalizeProposal(proposed,model,[]);
  assert.equal(normalized.outputMode,'rfq');assert.deepEqual(normalized.sourceReferences,model.sourceReferences);
  assert.deepEqual(normalized.applicationReview,model.applicationReview);
  const request=makeRequest({model,message:'What is my order code?',scope:'sales',selections:configurationText(model,quote())});
  assert.match(request.instructions,/quote requests only/);
  assert.match(JSON.stringify(request),/manufacturer part number pending/);
  assert.deepEqual(validateModel({...model,outputMode:'invent-code'}),['Invalid configuration output mode.']);
});
