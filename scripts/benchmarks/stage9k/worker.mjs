// One case per isolated process. Never retries or selects inputs based on results.
import fs from 'node:fs';import path from 'node:path';
import {here,canon} from './molecules.mjs';
import {loadEngine,loadModule,closeEngine} from '../../tests/engine.mjs';
const [id,resultFile]=process.argv.slice(2);
const c=JSON.parse(fs.readFileSync(path.join(here,'cases.json'),'utf8')).cases.find(c=>c.id===id);
const record={id,startedUTC:new Date().toISOString(),calls:[]};
try{
  const {utils}=await loadEngine();
  if(c.kind==='nomenclature'||c.kind==='ms'){
    const groups=await loadModule('/src/utils/functionalGroups/index.ts');
    const nomen=await loadModule('/src/utils/nomenclature/index.ts');
    const hierarchy=await groups.analyzeFunctionalGroupHierarchy(c.smiles);
    record.calls.push('analyzeNomenclatureAndProperties');
    const identity=await nomen.analyzeNomenclatureAndProperties(c.smiles,hierarchy.primaryGroups,hierarchy.mainGroup);
    record.identity=identity;record.hierarchy=hierarchy;
    if(c.kind==='ms'){
      const mass=await loadModule('/src/utils/spectroscopy/massSpec.ts'),p=identity.properties;
      const exact=Number.parseFloat(p.exactMass??'');record.calls.push('predictMassSpectrum');
      record.ms=await mass.predictMassSpectrum(p.molecularFormula,Number.isFinite(exact)?exact:null,hierarchy.functionalGroups,c.smiles);
    }
  }else if(c.kind==='reaction'){
    const extras=c.family==='sn2-cyanide'?['[C-]#N']:c.family==='sn2-iodide'?['[I-]']:c.family==='e2-ethoxide'?['CC[O-]']:[];
    record.input=[...c.reactants,...extras].join('.');
    record.calls.push('predictReactionPathways');
    record.pathways=await utils.predictReactionPathways(record.input,[]);
    const norm=s=>String(s??'').normalize('NFKD').replace(/[₀-₉]/g,x=>String('₀₁₂₃₄₅₆₇₈₉'.indexOf(x))).toLowerCase();
    const matches=p=>{
      const t=norm(`${p.ruleId} ${p.title} ${p.reagentLabel} ${p.reagentNote}`),rid=p.ruleId??'';
      if(c.family==='hbr')return /alkene/.test(rid)&&/hbr|hydrobrom/.test(t)&&!/peroxide|roor|radical|anti.markov/.test(t);
      if(c.family==='hydroboration')return /alkene/.test(rid)&&/hydrobor/.test(t);
      if(c.family==='bromination')return /alkene/.test(rid)&&/brominat|br2/.test(t)&&!/halohydrin|h2o|water/.test(t);
      if(c.family==='hydrogenation')return /alkene/.test(rid)&&/hydrogenat/.test(t);
      if(c.family==='lindlar')return /lindlar/.test(t);
      if(c.family==='dissolving-metal')return /alkyne/.test(rid)&&/dissolving|liquid.ammonia|nh3|sodium.*ammonia/.test(t);
      if(c.family==='sn2-cyanide')return rid==='haloalkane-sn2-cyanide';
      if(c.family==='sn2-iodide')return /haloalkane/.test(rid)&&/sn2|finkelstein/.test(t)&&/iodide|nai/.test(t);
      if(c.family==='e2-ethoxide')return /haloalkane/.test(rid)&&/e2/.test(rid)&&/ethoxide|naoet|alkoxide/.test(t)&&!/tert|bulky|tbu/.test(t);
      return false;
    };
    record.selected=record.pathways.filter(p=>p.productSmiles&&matches(p));
    record.products=record.selected.flatMap(p=>(p.productMixture?.memberSmiles?.length?p.productMixture.memberSmiles:[p.productSmiles]).flatMap(s=>s.split('.')).filter(Boolean).map(smiles=>({smiles,level:p.selectivityAssessment?.level??null,ruleId:p.ruleId,mixtureKind:p.productMixture?.kind??null})));
    record.interfaceLimitation='Conditions are represented by fixed pathway-family filters and explicit nucleophile/base molecules; engine listing API accepts no solvent/temperature field. No target-dependent fallback.';
  }else if(c.kind==='route'){
    const H=await import('../../tests/fixtures/convergentHelpers.mjs');
    const {registry}=await H.modules();const spec=c.steps[0],r=registry.find(r=>r.id===spec.rule);
    if(!r)throw new Error('missing route rule interface: '+spec.rule);
    record.calls.push('runRule');record.pathways=await H.runRule(spec.rule,spec.reactants);
    const target=canon(spec.product),p=record.pathways.find(p=>canon(p.productSmiles)===target);
    const planner=await loadModule('/src/utils/reactions/engine/multistepSynthesis.ts');
    const step=p?planner.forwardStepFromPathway(p):{ruleId:r.id,family:r.family,reactionType:r.reactionType,title:r.title,reactantSmiles:spec.reactants.join('.'),reactantComponents:spec.reactants,productSmiles:spec.product,productComponents:spec.product.split('.'),reagentLabel:r.reagents,reagentNote:r.reagentNote,reactantLabel:'',productLabel:'',shortExplanation:'',selectivity:[],limitations:[]};
    record.construction=p?'engine-pathway':'manual-submitted-route';
    const components=spec.product.split('.').sort((a,b)=>b.length-a.length);
    const route={id:c.id,startingSmiles:spec.reactants.join('.'),targetSmiles:components[0],steps:[{...step,id:'s1',stepNumber:1,source:'forward'}],confidence:'verified',score:0};
    const verify=await loadModule('/src/utils/reactions/engine/routeVerification.ts'),compat=await loadModule('/src/utils/reactions/engine/compatibility.ts'),select=await loadModule('/src/utils/reactions/engine/selectivityAssessment.ts'),quality=await loadModule('/src/utils/reactions/engine/routeQuality.ts');
    record.calls.push('verifyMultistepRoute','assessRouteCompatibility','assessRouteSelectivity','assessRouteQuality');
    route.verification=await verify.verifyMultistepRoute(route,registry);route.compatibility=await compat.assessRouteCompatibility(route,registry);route.selectivity=await select.assessRouteSelectivity(route,registry);
    record.route=route;record.quality=await quality.assessRouteQuality(route,registry);
  }
}catch(e){record.error=String(e?.stack??e);}
record.finishedUTC=new Date().toISOString();fs.writeFileSync(resultFile,JSON.stringify(record,null,2)+'\n');
await closeEngine();process.exit(record.error?1:0);
