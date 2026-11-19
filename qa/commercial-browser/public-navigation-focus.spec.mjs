import {test,expect} from '../playwright/node_modules/@playwright/test/index.mjs';

// All checks run against the local fixture; never contact analytics or production.
test.beforeEach(async({page})=>{
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    return url.origin==='http://127.0.0.1:4179'?route.continue():route.abort();
  });
});

for(const route of ['/','/services','/methodology','/about']){
  test(`${route} keeps keyboard focus on visible navigation after restoration and resize`,async({page})=>{
    await page.addInitScript(()=>{
      const events=[];
      window.__qaNavigationFocusEvents=events;
      const record=(type,event)=>{
        const menu=document.getElementById('public-menu-button');
        events.push({type,target:event?.target?.id||event?.target?.tagName,
          related:event?.relatedTarget?.id||event?.relatedTarget?.tagName,
          active:document.activeElement?.id||document.activeElement?.tagName,
          width:innerWidth,desktop:matchMedia('(min-width: 961px)').matches,
          targetRects:event?.target?.getClientRects?.().length,menuRects:menu?.getClientRects().length});
        if(events.length>40)events.shift();
      };
      document.addEventListener('focusin',e=>record('focusin',e));
      document.addEventListener('focusout',e=>record('focusout',e));
      matchMedia('(min-width: 961px)').addEventListener('change',()=>{
        record('breakpoint');requestAnimationFrame(()=>record('breakpoint-frame'));
      });
    });
    await page.setViewportSize({width:390,height:844});
    await page.goto(route);
    const menu=page.locator('#public-menu-button');
    const firstLink=page.locator('#public-nav a').first();
    await menu.click();
    await firstLink.focus();
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    await expect(menu).toHaveAttribute('aria-expanded','false');
    await expect(menu).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#public-nav a:focus')).toHaveCount(0);

    await page.setViewportSize({width:1440,height:1000});
    await expect(firstLink).toBeVisible();
    await firstLink.focus();
    await page.setViewportSize({width:390,height:844});
    try { await expect(menu).toBeFocused(); }
    catch(error) {
      error.message+='\nNavigation focus events: '+JSON.stringify(await page.evaluate(()=>window.__qaNavigationFocusEvents));
      throw error;
    }
    await expect(menu).toHaveAttribute('aria-expanded','false');

    // Growing the viewport must not leave focus on the now-hidden Menu button.
    await page.setViewportSize({width:1440,height:1000});
    await expect(firstLink).toBeFocused();
  });
}

test('closing navigation preserves focus deliberately moved into the page',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const menu=page.locator('#public-menu-button');
  await menu.click();
  const main=page.locator('#main-content');
  await main.focus();
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await expect(menu).toHaveAttribute('aria-expanded','false');
  await expect(main).toBeFocused();
});

async function expectVisibleFocus(page, locator) {
  await expect(locator).toBeFocused();
  await expect(locator).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>{
    const el=document.activeElement;
    return el!==document.body && el.isConnected && el.getClientRects().length>0 &&
      getComputedStyle(el).visibility!=='hidden';
  })).toBe(true);
}

for (const direction of ['desktop-to-mobile','mobile-to-desktop']) {
  for (const dismissal of ['blur','blank-click']) {
    test(`${direction}: ${dismissal} clears remembered navigation focus`,async({page})=>{
      const desktop=direction==='desktop-to-mobile';
      await page.setViewportSize({width:desktop?961:960,height:1000});
      await page.goto('/');
      await page.getByRole('button',{name:'Decline',exact:true}).click();
      const control=desktop?page.locator('#public-nav a').nth(2):page.locator('#public-menu-button');
      await control.focus();
      if(dismissal==='blur')await control.evaluate(el=>el.blur());
      else {
        // A heading click focuses its tabindex-bearing main ancestor. Use a
        // non-focusable blank surface outside main to exercise blur to body.
        await page.evaluate(()=>{
          const blank=document.createElement('div');
          blank.id='qa-blank-surface';
          blank.style.cssText='position:fixed;inset:0 auto auto 0;width:12px;height:12px;z-index:9999';
          document.body.appendChild(blank);
        });
        await page.locator('#qa-blank-surface').click();
      }
      await expect.poll(()=>page.evaluate(()=>document.activeElement===document.body)).toBe(true);
      await page.setViewportSize({width:desktop?960:961,height:1000});
      if(desktop)await expect(page.locator('#public-menu-button')).toBeVisible();
      else await expect(page.locator('#public-menu-button')).toBeHidden();
      // Let the media-query callback run before asserting that it did not steal focus.
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      expect(await page.evaluate(()=>document.activeElement===document.body)).toBe(true);
    });
  }
}

test('main content retains focus across repeated 960/961 crossings',async({page})=>{
  await page.goto('/');
  const main=page.locator('#main-content');
  await main.focus();
  for(const width of [960,961,960,961]) {
    await page.setViewportSize({width,height:1000});
    await expectVisibleFocus(page,main);
  }
});

for(const index of [2,4]) {
  test(`navigation link ${index+1} recovers focus across repeated exact-boundary crossings`,async({page})=>{
    await page.setViewportSize({width:961,height:1000});
    await page.goto('/');
    const menu=page.locator('#public-menu-button');
    const link=page.locator('#public-nav a').nth(index);
    const first=page.locator('#public-nav a').first();
    for(let crossing=0;crossing<3;crossing++) {
      await link.focus();
      await page.setViewportSize({width:960,height:1000});
      await expectVisibleFocus(page,menu);
      await page.setViewportSize({width:961,height:1000});
      await expectVisibleFocus(page,first);
    }
  });
}

test('Shift+Tab out of mobile navigation leaves visible focus on Menu',async({page})=>{
  await page.setViewportSize({width:960,height:1000});
  await page.goto('/');
  const menu=page.locator('#public-menu-button');
  await menu.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expectVisibleFocus(page,page.locator('#public-nav a').first());
  await page.keyboard.press('Shift+Tab');
  await expectVisibleFocus(page,menu);
  await page.keyboard.press('Escape');
  await expectVisibleFocus(page,menu);
  await expect(menu).toHaveAttribute('aria-expanded','false');
});

test('removed navigation controls are not used for breakpoint recovery',async({page})=>{
  await page.setViewportSize({width:961,height:1000});
  await page.goto('/');
  const link=page.locator('#public-nav a').nth(2);
  await link.focus();
  await link.evaluate(el=>el.remove());
  await page.setViewportSize({width:960,height:1000});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(await page.evaluate(()=>document.activeElement===document.body)).toBe(true);
});

test('same-page fragment navigation keeps the native fragment focus',async({page})=>{
  await page.setViewportSize({width:960,height:1000});
  await page.goto('/');
  // Existing links have no fragments. Retarget one existing listener to exercise
  // native hash navigation without changing the product markup.
  const link=page.locator('#public-nav a').first();
  await link.evaluate(el=>el.setAttribute('href','#main-content'));
  await page.locator('#public-menu-button').click();
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main-content$/);
  await expectVisibleFocus(page,page.locator('#main-content'));
  await expect(page.locator('#public-menu-button')).toHaveAttribute('aria-expanded','false');
});
