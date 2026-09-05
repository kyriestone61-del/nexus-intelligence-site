(function(){
  const path=location.pathname.replace(/\/$/,'')||'/';
  const protectedPaths=new Set(['/privacy','/terms','/accessibility','/security']);
  if(path==='/portal'||protectedPaths.has(path))return;

  const nav=document.querySelector('.navlinks');
  if(nav){
    nav.querySelectorAll('a[href="/case-studies"]').forEach(link=>link.remove());
  }

  if(path==='/'){
    const preview=document.querySelector('.hero-workspace');
    if(preview){
      preview.setAttribute('aria-label','Sample Relystra client workspace using fictional example data');
      const title=preview.querySelector('.workspace-top b');
      const badge=preview.querySelector('.demo-label');
      const greeting=preview.querySelector('.workspace-greeting h3');
      const note=preview.querySelector('.demo-note');
      if(title)title.textContent='SAMPLE CLIENT WORKSPACE';
      if(badge)badge.textContent='FICTIONAL EXAMPLE';
      if(greeting)greeting.textContent='Example Company — Sample Dashboard';
      if(note)note.textContent='Sample only — this is not a real Relystra client or account. All company names, metrics, activity, and outcomes shown here are fictional illustrative data.';
    }
  }
})();
