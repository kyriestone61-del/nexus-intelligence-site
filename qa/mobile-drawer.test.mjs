import test from 'node:test';
import assert from 'node:assert/strict';
import {mountMobileMenu} from '../portal-delivery-lifecycle.js';

function fixture(t, small=true){
 const oldDocument=globalThis.document,oldMatchMedia=globalThis.matchMedia;
 t.after(()=>{globalThis.document=oldDocument;globalThis.matchMedia=oldMatchMedia});
 const classes=new Set(),attributes={},events={};let toggle,focusCount=0,mediaChange;
 const sidebar={querySelector:()=>null,classList:{toggle:(k,v)=>v?classes.add(k):classes.delete(k),contains:k=>classes.has(k)}};
 const media={matches:small,addEventListener:(name,callback)=>{assert.equal(name,'change');mediaChange=callback}};
 globalThis.document={createElement:()=>toggle={setAttribute:(k,v)=>attributes[k]=v,focus:()=>focusCount++}};
 globalThis.matchMedia=query=>{assert.equal(query,'(max-width:760px)');return media};
 const nav={id:'',closest:()=>sidebar,before:()=>{},addEventListener:(name,callback)=>events[name]=callback};
 mountMobileMenu(nav);
 return {attributes,toggle,nav,media,resize:()=>mediaChange(),focus:()=>focusCount,click:selector=>events.click({target:{closest:selectors=>selectors.split(',').includes(selector)?{}:null}})};
}

for(const selector of ['[data-client-group]','[data-client-view]','[data-relystra-nav]']){
 test(`mobile navigation closes and restores toggle focus for ${selector}`,t=>{
  const f=fixture(t);assert.equal(f.attributes['aria-expanded'],'false');
  f.toggle.onclick();assert.equal(f.attributes['aria-expanded'],'true');
  f.click(selector);assert.equal(f.attributes['aria-expanded'],'false');assert.equal(f.focus(),1);
  assert.equal(f.attributes['aria-controls'],f.nav.id);
 });
}
test('unrelated mobile controls do not collapse the menu or steal focus',t=>{
 const f=fixture(t);f.toggle.onclick();f.click('[data-unrelated]');
 assert.equal(f.attributes['aria-expanded'],'true');assert.equal(f.focus(),0);
});
test('desktop navigation remains expanded without stealing focus',t=>{
 const f=fixture(t,false);f.click('[data-client-group]');
 assert.equal(f.attributes['aria-expanded'],'true');assert.equal(f.focus(),0);
});
test('viewport changes preserve existing collapse behavior',t=>{
 const f=fixture(t,false);f.media.matches=true;f.resize();assert.equal(f.attributes['aria-expanded'],'false');
 f.media.matches=false;f.resize();assert.equal(f.attributes['aria-expanded'],'true');
});
