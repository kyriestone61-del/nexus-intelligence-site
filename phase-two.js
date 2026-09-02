(function(){
  const path=location.pathname.replace(/\/$/,'')||'/';
  const protectedPrefixes=['/portal','/privacy','/terms','/accessibility','/security'];
  if(protectedPrefixes.some(prefix=>path===prefix||path.startsWith(prefix+'/')))return;

  document.querySelectorAll('a[href="/case-studies"]').forEach(link=>{
    if(link.closest('.navlinks')){
      link.remove();
      return;
    }
    link.href='/methodology';
    if(/results|evidence/i.test(link.textContent||''))link.textContent='Methodology';
  });
})();
