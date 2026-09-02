(function(){
  const path=location.pathname.replace(/\/$/,'')||'/';
  const protectedPaths=new Set(['/privacy','/terms','/accessibility','/security']);
  if(path==='/portal'||protectedPaths.has(path))return;

  const nav=document.querySelector('.navlinks');
  if(nav){
    nav.querySelectorAll('a[href="/portal"],a[href="/case-studies"]').forEach(link=>link.remove());
  }
})();
