// JavaScript, model-store-check.mjs, Node.js24: isolated native showcase/pricing authority checks.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
const root=mkdtempSync(path.join(tmpdir(),'axiom-models-'));mkdirSync(path.join(root,'db'));process.env.NINEROUTER_DATA_DIR=root;
const seed=new DatabaseSync(path.join(root,'db','data.sqlite'));
seed.exec("CREATE TABLE showcaseModels(id TEXT PRIMARY KEY,provider TEXT NOT NULL,modelId TEXT NOT NULL,displayName TEXT NOT NULL,description TEXT,category TEXT,badge TEXT,inputPrice REAL,outputPrice REAL,cachedPrice REAL,reasoningPrice REAL,contextWindow INTEGER,maxOutput INTEGER,capabilities TEXT,isActive INTEGER,isPopular INTEGER,sortOrder INTEGER,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);CREATE TABLE kv(scope TEXT,key TEXT,value TEXT,PRIMARY KEY(scope,key))");
seed.prepare('INSERT INTO kv VALUES(?,?,?)').run('pricing','cx',JSON.stringify({connected:{input:1,keep:'original'},other:{input:9}}));seed.close();
const {routerDb}=await import('./lib/merchant-commerce.mjs');const {saveShowcase,deleteShowcase,showcaseRecords,matchShowcase,saveModelPricing,configuredPricing,modelPricing}=await import('./lib/model-store.mjs');
const live=[{id:'cx/connected',provider:'cx'},{id:'other/connected',provider:'other'}];
try{
 const record=saveShowcase({provider:'cx',modelId:'cx/connected',displayName:'Verified name',isActive:true},live).model;
 assert.equal(matchShowcase(record,live).id,'cx/connected');assert.equal(matchShowcase({provider:'wrong',modelId:'connected'},live),null);
 assert.throws(()=>saveShowcase({provider:'cx',modelId:'cx/nonexistent',displayName:'Unknown'},live),{code:'model_not_connected'});
 saveModelPricing({id:'cx/connected',input:0,output:4.25,cached:null},live);
 assert.equal(modelPricing(live[0],configuredPricing()).inputPrice,0);assert.equal(modelPricing(live[0],configuredPricing()).outputPrice,4.25);assert.equal(modelPricing(live[1],configuredPricing()).inputPrice,null);
 assert.throws(()=>saveModelPricing({id:'cx/connected',input:-1},live),{code:'invalid_model'});
 const config=JSON.parse(routerDb().prepare("SELECT value FROM kv WHERE scope='pricing' AND key='cx'").get().value);assert.equal(config.connected.keep,'original');assert.equal(config.other.input,9);
 saveModelPricing({id:'cx/connected',input:null,output:null},live);assert.equal(modelPricing(live[0],configuredPricing()).pricingSource,null);
 saveShowcase({isActive:false},live,record.id);assert.equal(showcaseRecords()[0].isActive,false);deleteShowcase(record.id);assert.deepEqual(showcaseRecords(),[]);
 console.log('PASS: exact live-ID publication, price null versus zero, unknown native fields retained, unrelated models intact, no sample reseeding.');
}finally{routerDb().close();rmSync(root,{recursive:true,force:true});}
