import{S,$,bootSession,loadCloud,loadModules,initNav,go}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=core.js';
import{initAuth,openAfterAuth}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=auth.js';
import{renderDashboard}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=dashboard.js';
import{renderAcademy}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=academy.js';
import{renderPath}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=personalize.js';
import{renderTutor,renderQuiz,renderMastery}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=learning.js';
import{renderMissions,renderLabs,renderResearch,renderSources}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=operations.js';
import{renderOwner,renderAccount}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=owner.js';
const renders={dashboard:renderDashboard,personalize:renderPath,academy:renderAcademy,tutor:renderTutor,quiz:renderQuiz,mastery:renderMastery,missions:renderMissions,labs:renderLabs,research:renderResearch,sources:renderSources,account:renderAccount,nexus:renderOwner,statecraft:renderOwner,career:renderOwner,trading:renderOwner};
async function boot(){initNav();initAuth();await loadModules();await bootSession();if(S.user){await loadCloud();openAfterAuth()}renderOwner();renderDashboard();renderPath();renderAcademy();renderMastery();renderResearch();renderSources();renderAccount();window.addEventListener('hlo:view',e=>{const id=e.detail.id;if(['nexus','statecraft','career','trading'].includes(id)&&!S.owner){go('dashboard');return}const fn=renders[id];if(fn)fn()});if(location.hash){const id=location.hash.slice(1);if(document.getElementById(id))go(id)}}
boot().catch(e=>{console.error(e);document.body.insertAdjacentHTML('beforeend',`<div style="position:fixed;inset:auto 20px 20px 20px;background:#4a1f1f;color:white;padding:14px;border-radius:10px;z-index:9999">Startup error: ${String(e.message||e)}</div>`)});
