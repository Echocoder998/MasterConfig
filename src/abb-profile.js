// Curated, bounded RFQ profile. Codes below are ABB table references, never an
// assembled manufacturer part number. See docs/abb-processmaster.md for scope.
export const ABB_PROFILE_ID = 'abb-processmaster-fep631';
const sourceUrl = 'https://library.e.abb.com/public/4ed922dcaaf04b01b2d951c80b4fe9ce/DS_FEP630_EN_L.pdf';
const field = (id, label, page, rows, extra = {}) => ({id, label, type:'single', required:true, codeOrder:0, prefix:'', options:rows.map(([code,label,description=''])=>({code,label,description,sourcePage:page})), ...extra});
const sizes = [[15,'½'],[20,'¾'],[25,'1'],[32,'1¼'],[40,'1½'],[50,'2'],[65,'2½'],[80,'3'],[100,'4'],[125,'5'],[150,'6'],[200,'8'],[250,'10'],[300,'12'],[350,'14'],[400,'16'],[450,'18'],[500,'20'],[600,'24']];
const fields = [
  field('size','Meter size',70,sizes.map(([dn,inch])=>[String(dn).padStart(4,'0'),`DN ${dn} (${inch} in)`, 'Select an already sized meter; flow sizing requires application review.'])),
  field('connection','Flange standard and nominal rating',71,[['A1','ASME B16.5 Class 150'],['A3','ASME B16.5 Class 300'],['D5','DIN PN 63','DN 25–200, hard rubber only.'],['D6','DIN PN 100','DN 25–200, hard rubber only.']]),
  field('flange_material','Process connection material',72,[['B','Carbon steel','Exact grade and pressure/temperature limits require ABB confirmation.'],['C','Stainless steel','Exact grade and pressure/temperature limits require ABB confirmation.']]),
  field('liner','Liner',71,[['T1','PTFE','DN 10–600 in source.'],['P1','PFA','DN 3–200 in source.'],['E1','ETFE','DN 25–1000 in ordering table; this profile stops at DN 600.'],['R2','Hard rubber','DN 25 and larger.'],['R4','Soft rubber','DN 50 and larger.'],['T2','Thick PTFE','DN 25–300.']]),
  field('electrode_design','Electrode design',72,[['1','Standard'],['5','Pointed head','DN 10–400.']]),
  field('electrode_material','Measuring electrode material',72,[['S','316Ti stainless steel (1.4571)'],['D','Hastelloy C-4 (2.4610)'],['H','Hastelloy B-3 (2.4600)'],['F','Titanium'],['G','Tantalum'],['J','Platinum-iridium']]),
  field('grounding','Grounding and full pipe detection electrodes',72,[['0','Neither electrode'],['1','Full pipe detection only','DN 50 or larger; installation and conductivity restrictions require review.'],['2','Grounding electrode only','Same material as measuring electrodes.'],['3','Grounding and full pipe detection','DN 50 or larger; grounding electrode matches measuring material.']]),
  field('grounding_rings','Grounding rings',72,[['A','No rings'],['B','One ring mounted to flange','PTFE, thick PTFE, ETFE or PFA; ring material requires review.'],['C','Two rings mounted to flanges','PTFE, thick PTFE, ETFE or PFA; ring material requires review.']]),
  field('approval','Explosion protection request',70,[['Y0','No Ex approval — CE standard'],['A1','ATEX / IECEx Zone 1 / 21','Dual compartment housing required; verify certificate and temperature class.'],['A2','ATEX / IECEx Zone 2 / 22','Verify certificate and temperature class.'],['F2','cFMus Class I Div. 2','Verify certificate and temperature class.']]),
  field('housing','Integral transmitter housing and cable thread',70,[['S1','Single compartment · aluminum · M20 × 1.5'],['S2','Single compartment · aluminum · ½ in NPT'],['D1','Dual compartment · aluminum · M20 × 1.5'],['D2','Dual compartment · aluminum · ½ in NPT']]),
  field('temperature_design','Sensor design and ambient range request',74,[['TK1','Standard design · −20 to 60 °C ambient','Liner, process temperature, pressure and Ex limits still apply.'],['TK4','Standard design · −40 to 60 °C ambient','Liner, process temperature, pressure and Ex limits still apply.'],['TKH','High temperature design · −20 to 60 °C ambient','PFA / thick PTFE up to 180 °C; PTFE / ETFE up to 130 °C, subject to full application review.'],['TKK','High temperature design · −40 to 60 °C ambient','PFA / thick PTFE up to 180 °C; PTFE / ETFE up to 130 °C, subject to full application review.']]),
  field('power','Power supply and line frequency setting',72,[['A','100–230 V AC · 50 Hz'],['C','100–230 V AC · 60 Hz'],['D','24 V DC · 50 Hz setting'],['E','24 V DC · 60 Hz setting']]),
  field('display','Display',72,[['0','No display'],['2','Display with keypad']]),
  field('outputs','Outputs and communication',72,[['G0','HART','One active/passive current output and two passive digital outputs.'],['M1','HART + Modbus RTU','Requires option card 1 DRM; includes standard current and digital outputs.'],['D1','HART + PROFIBUS DP','Requires option card 1 DRD; includes standard current and digital outputs.'],['E2','HART + one-port Ethernet','Requires DR6; single compartment, non-Ex or Zone 2 / Div. 2.'],['E3','HART + two-port Ethernet','Requires DR6; single compartment, non-Ex or Zone 2 / Div. 2.']]),
  field('card_one','Option card 1',73,[['DR0','No card'],['DRN','One digital input'],['DRG','One digital output'],['DRT','24 V DC transmitter loop power supply'],['DRA','One passive 4–20 mA output'],['DRM','Modbus RTU'],['DRD','PROFIBUS DP'],['DR6','Standard Ethernet']]),
  field('card_two','Option card 2',73,[['DS0','No card'],['DSA','One passive 4–20 mA output'],['DSN','One digital input'],['DSG','One digital output']]),
  field('ethernet_protocol','Ethernet protocol request',75,[['GCE','EtherNet/IP'],['GCM','Modbus TCP'],['GCW','Webserver']],{visibleWhen:[{field:'outputs',op:'in',value:['E2','E3']}]}),
  field('calibration','Factory calibration',74,[['RCD','0.4% factory calibration','Subject to the accuracy conditions in the datasheet.'],['RCE','0.3% factory calibration','Three or five test points required.']]),
  field('test_points','Calibration test points',75,[['TV2','Two points'],['TV3','Three points'],['TV5','Five points']]),
  field('calibration_certificate','Calibration certificate',73,[['CMA','ABB standard'],['CMW','Third-party witnessed calibration'],['CMD','ISO 17025 five-point calibration','Five test points required.']]),
  field('certificates','Additional certificate requests',73,[['C2','EN 10204 inspection certificate 3.1'],['CS','SIL2 certificate','Dual compartment housing required; safety application still requires review.']],{type:'multi',required:false})
];
const rules=[];
const condition=(field,op,value)=>({field,op,value});
function exclude(id, when, targetField, targetCodes, message, sourcePage=76) {rules.push({id,when,targetField,targetCodes,action:'exclude',message,sourcePage});}
function sizeLimit(id,targetField,targetCodes,min,max,message) {
  if(min)exclude(id+'-min',[condition('size','lt',String(min))],targetField,targetCodes,message);
  if(max)exclude(id+'-max',[condition('size','gt',String(max))],targetField,targetCodes,message);
}
// Numeric comparisons intentionally use the zero-padded numeric DN codes.
sizeLimit('pn-high','connection',['D5','D6'],25,200,'PN 63 / PN 100 require DN 25–200 with hard rubber (note 6).');
exclude('pn-high-liner',[condition('liner','neq','R2')],'connection',['D5','D6'],'PN 63 / PN 100 require hard rubber (note 6).');
exclude('pn-high-liner-reverse',[condition('connection','in',['D5','D6'])],'liner',['T1','P1','E1','R4','T2'],'PN 63 / PN 100 require hard rubber (note 6).');
exclude('dn15-steel',[condition('size','eq','0015')],'flange_material',['B'],'DN 15 process connections are stainless steel in design level A (materials table).',18);
sizeLimit('pfa','liner',['P1'],null,200,'PFA is available through DN 200 (note 10).');
sizeLimit('etfe','liner',['E1'],25,null,'ETFE starts at DN 25 (note 9).');
sizeLimit('hard-rubber','liner',['R2'],25,null,'Hard rubber starts at DN 25 (note 11).');
sizeLimit('soft-rubber','liner',['R4'],50,null,'Soft rubber starts at DN 50 (note 12).');
sizeLimit('thick-ptfe','liner',['T2'],25,300,'Thick PTFE requires DN 25–300 (note 14).');
sizeLimit('pointed','electrode_design',['5'],null,400,'Pointed-head electrodes are available through DN 400 (note 16).');
sizeLimit('full-pipe','grounding',['1','3'],50,null,'Full pipe detection electrodes require DN 50 or larger in the ordering notes (17, 19); review diagnostic prerequisites on page 5.');
exclude('rubber-rings',[condition('liner','in',['R2','R4'])],'grounding_rings',['B','C'],'Mounted grounding rings are listed for PTFE / thick PTFE / ETFE / PFA only (note 20).');
exclude('rubber-rings-reverse',[condition('grounding_rings','in',['B','C'])],'liner',['R2','R4'],'Mounted grounding rings are listed for PTFE / thick PTFE / ETFE / PFA only (note 20).');
exclude('zone-one-housing',[condition('approval','eq','A1')],'housing',['S1','S2'],'Zone 1 / 21 requires dual compartment housing (notes 1, 4).');
exclude('zone-one-housing-reverse',[condition('housing','in',['S1','S2'])],'approval',['A1'],'Zone 1 / 21 requires dual compartment housing (notes 1, 4).');
exclude('high-temp-rubber',[condition('liner','in',['R2','R4'])],'temperature_design',['TKH','TKK'],'High temperature design is listed for PFA / thick PTFE / ETFE / PTFE, not rubber (note 28).');
exclude('high-temp-rubber-reverse',[condition('temperature_design','in',['TKH','TKK'])],'liner',['R2','R4'],'High temperature design is listed for PFA / thick PTFE / ETFE / PTFE (note 28).');
for(const [output,card,note] of [['M1','DRM',34],['D1','DRD',35],['E2','DR6',36],['E3','DR6',36]]) {
  rules.push({id:'output-requires-'+output,when:[condition('outputs','eq',output)],targetField:'card_one',targetCodes:[card],action:'require',message:`Output ${output} requires option card 1 ${card} (note ${note}).`,sourcePage:76});
  exclude('output-card-'+output,[condition('outputs','eq',output)],'card_one',fields.find(f=>f.id==='card_one').options.map(o=>o.code).filter(c=>c!==card),`Output ${output} requires option card 1 ${card} (note ${note}).`);
}
// Outputs control the paired card. Changing the protocol clears an incompatible
// card; reciprocal gates would trap users in a valid pair with no way to switch.
exclude('hart-card-scope',[condition('outputs','eq','G0')],'card_one',['DRM','DRD','DR6'],'Profile scope: choose the matching communication output before choosing a Modbus, PROFIBUS or Ethernet card.', '72–73; profile scope');
for(const [one,two,label] of [['DRN','DSN','digital input'],['DRG','DSG','digital output']]) {
  exclude('one-'+one,[condition('card_one','eq',one)],'card_two',[two],`Only one optional ${label} card may be installed (plug-in card quantity table).`,52);
  exclude('one-'+two,[condition('card_two','eq',two)],'card_one',[one],`Only one optional ${label} card may be installed (plug-in card quantity table).`,52);
}
for(const [id,when] of [['dual',[condition('housing','in',['D1','D2'])]],['zone-one',[condition('approval','eq','A1')]]]) {
  exclude('ethernet-card-'+id,when,'card_one',['DR6'],'Standard Ethernet requires single compartment housing and non-Ex or Zone 2 / Div. 2 (note 37).');
  exclude('ethernet-output-'+id,when,'outputs',['E2','E3'],'Standard Ethernet requires single compartment housing and non-Ex or Zone 2 / Div. 2 (notes 36, 37).');
}
for(const [id,when] of [['card',[condition('card_one','eq','DR6')]],['output',[condition('outputs','in',['E2','E3'])]]]) {
  exclude('ethernet-housing-'+id,when,'housing',['D1','D2'],'Standard Ethernet requires single compartment housing (note 37).');
  exclude('ethernet-approval-'+id,when,'approval',['A1'],'Standard Ethernet is non-Ex or Zone 2 / Div. 2 only (note 37).');
}
exclude('calibration-points',[condition('calibration','eq','RCE')],'test_points',['TV2'],'0.3% calibration requires three or five test points (note 26).');
exclude('calibration-points-reverse',[condition('test_points','eq','TV2')],'calibration',['RCE'],'0.3% calibration requires three or five test points (note 26).');
exclude('iso-points',[condition('calibration_certificate','eq','CMD')],'test_points',['TV2','TV3'],'ISO 17025 calibration requires five test points (note 23).');
exclude('iso-points-reverse',[condition('test_points','in',['TV2','TV3'])],'calibration_certificate',['CMD'],'ISO 17025 calibration requires five test points (note 23).');
rules.push({id:'iso-require-five',when:[condition('calibration_certificate','eq','CMD')],targetField:'test_points',targetCodes:['TV5'],action:'require',message:'ISO 17025 calibration requires five test points (note 23).',sourcePage:76});
exclude('sil-housing',[condition('housing','in',['S1','S2'])],'certificates',['CS'],'SIL2 certificate requires housing D1 or D2 (note 33).');
exclude('sil-housing-reverse',[condition('certificates','contains','CS')],'housing',['S1','S2'],'SIL2 certificate requires housing D1 or D2 (note 33).');

export const abbProfile = {
  id:ABB_PROFILE_ID, name:'ProcessMaster FEP631', manufacturer:'ABB', subtitle:'Electromagnetic flowmeter · Integral mount · RFQ profile', baseCode:'FEP631', outputMode:'rfq', status:'draft',
  revision:'DS/FEP630-EN Rev. L · 2025-10', sourceName:'ABB ProcessMaster FEP630 datasheet', sourceUrl,
  sourceReferences:[{title:'ABB ProcessMaster FEP630 datasheet',url:sourceUrl,revision:'L',published:'2025-10',reviewed:'2026-10-28',pages:'18–19, 34–39, 52, 70–76'},{title:'ABB ProcessMaster FEP630 product page',url:'https://new.abb.com/products/measurement-products/flow/electromagnetic-flowmeters/processmaster/processmaster-fep630',reviewed:'2026-10-28'}],
  notes:'RFQ ONLY — no manufacturer part number is generated. Scope: FEP631 integral mount, DN 15–600, ASME Class 150/300 or DIN PN 63/100, selected liners, electrodes, approvals and HART/Modbus RTU/PROFIBUS DP/Ethernet. IP67 transmitter / IP67 sensor. ABB must confirm design level, exact materials, complete ordering syntax, current availability and application suitability. Remote FEP632/FET632, PoE/APL/PROFIBUS PA, cFMus Div. 1, NEPSI, potable-water approvals, ceramic/Linatex, special builds and 0.2% calibration are outside this profile.',
  applicationReview:['Fluid name, composition, solids/abrasion and conductivity (including demineralized-water service).','Minimum / normal / maximum flow and units; pipe size and required flow range. Meter size selection does not perform sizing.','Minimum / normal / maximum operating pressure and temperature, vacuum and cleaning conditions; check the combined liner/flange limits and nameplate.','Wetted-material compatibility, grounding/pipe lining and installation orientation. For full pipe detection reconcile page 5 prerequisites with notes 17/19.','Ambient conditions, hazardous-area classification and certificate temperature limits; confirm the selected approval covers the installation.','ABB-confirmed design level, exact flange/meter-tube/ring material grades, cable/connectors, remaining order positions and final quotation/part number.'],
  reviewQuestions:['Rev L table references for cFMus Div. 1 conflict (notes 30 and 32); option intentionally omitted pending ABB clarification.','Rev L 0.2% calibration points to note 27 although note 24 describes its restrictions; option intentionally omitted.','Full pipe detection starts at DN 50 in ordering notes but page 5 says > DN 50; availability request is captured, diagnostic performance needs ABB confirmation.','Confirm superseding datasheet, regional availability and unmodeled accessory/approval requirements before activation and every order.'],
  adminInstructions:'Keep outputMode rfq. These codes are source references, not a full order number. Preserve scope, source provenance and application review. Add new variants only with verified ABB tables/footnotes; never infer pressure-temperature suitability or exact material grades.',
  specs:[{value:'DN 15–600',label:'Profile size range'},{value:'FEP631',label:'Integral mount'},{value:'RFQ only',label:'ABB confirmation required'}],
  steps:[{id:'size_connection',label:'Size & connection',fields:['size','connection','flange_material']},{id:'wetted',label:'Liner & electrodes',fields:['liner','electrode_design','electrode_material']},{id:'grounding',label:'Grounding',fields:['grounding','grounding_rings']},{id:'design',label:'Approval & housing',fields:['approval','housing','temperature_design']},{id:'electronics',label:'Power & communication',fields:['power','display','outputs','card_one','card_two','ethernet_protocol']},{id:'calibration',label:'Calibration & certificates',fields:['calibration','test_points','calibration_certificate','certificates']}],
  fields,rules,defaultValues:{}
};
