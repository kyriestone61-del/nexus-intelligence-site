from pathlib import Path
p=Path('app.js')
s=p.read_text()
old="""      if(!j.quickScan?.completedAt)return {href:'/quick-scan',label:'Get My Free AI Snapshot'};\n      if(!j.booking?.status)return {href:'/book',label:'Request My Fit Call'};"""
new="""      if(!j.quickScan?.completedAt&&!j.assessment?.completedAt)return {href:'/quick-scan',label:'Get My Free AI Snapshot'};\n      if(!j.booking?.status)return {href:'/book',label:'Request My Fit Call'};"""
if old not in s: raise SystemExit('next() target not found')
s=s.replace(old,new)
old_func=r'''  function simplifyQuickScanHandoff(){
    if(path!=='/quick-scan')return;
    let tries=0;
    const patch=()=>{
      tries++;
      const root=document.getElementById('snapshotBody');
      if(root){
        root.querySelectorAll('a[href="/assessment"]').forEach(a=>{
          a.href='/book';
          if(/diagnostic|deeper|continue|assessment/i.test(a.textContent||''))a.textContent='Request a 20-Minute Fit Call →';
        });
        root.querySelectorAll('a[href="/book"]').forEach(a=>{
          if(/book/i.test(a.textContent||''))a.textContent=(a.textContent||'').replace(/Book/gi,'Request');
        });
      }
      if(tries<24)setTimeout(patch,750);
    };
    patch();
  }
'''
new_func=r'''  function simplifyQuickScanHandoff(){
    if(path!=='/quick-scan')return;
    const root=document.getElementById('snapshotBody');if(!root)return;
    const patch=()=>{
      root.querySelectorAll('a[href="/assessment"]').forEach(a=>{
        a.href='/book';
        if(/diagnostic|deeper|continue|assessment/i.test(a.textContent||''))a.textContent='Request a 20-Minute Fit Call →';
      });
      root.querySelectorAll('a[href="/book"]').forEach(a=>{
        if(/book/i.test(a.textContent||''))a.textContent=(a.textContent||'').replace(/Book/gi,'Request');
      });
      document.querySelectorAll('footer a[href="/assessment"]').forEach(a=>{a.href='/book';a.textContent='Request a Fit Call'});
    };
    patch();
    const observer=new MutationObserver(()=>patch());
    observer.observe(root,{childList:true,subtree:true});
  }
'''
if old_func not in s: raise SystemExit('quick scan handoff function not found')
s=s.replace(old_func,new_func)
p.write_text(s)
print('journey edge fix applied')
