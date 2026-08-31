import{S,$,bootSession,loadCloud,loadModules,initNav,go}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=core.js';
import{initAuth,openAfterAuth}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=auth.js';
import{renderDashboard}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=dashboard.js';
import{renderAcademy}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=academy.js';
import{renderPath}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=personalize.js';
import{renderTutor,renderMastery}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=learning.js';
import{renderCapabilityQuiz}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=capability.js';
import{renderMissions,renderLabs,renderResearch,renderSources}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=operations.js';
import{renderOwner,renderAccount}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=owner.js';
import{initExperience}from'https://dmdgkjksouhhsuojthav.supabase.co/functions/v1/hlo-app?asset=experience-v2.js';
const renders={dashboard:renderDashboard,personalize:renderPath,academy:renderAcademy,tutor:renderTutor,quiz:renderCapabilityQuiz,mastery:renderMastery,missions:renderMissions,labs:renderLabs,research:renderResearch,sources:renderSources,account:renderAccount,nexus:renderOwner,statecraft:renderOwner,career:renderOwner,trading:renderOwner};
async function boot(){initNav();initAuth();await loadModules();await bootSession();if(S.user){await loadCloud();openAfterAuth()}renderOwner();renderDashboard();renderPath();renderAcademy();renderMastery();renderResearch();renderSources();renderAccount();initExperience();window.addEventListener('hlo:view',e=>{const id=e.detail.id;if(['nexus','statecraft','career','trading'].includes(id)&&!S.owner){go('dashboard');return}const fn=renders[id];if(fn)fn()});window.addEventListener('hlo:go',e=>go(e.detail.id));if(location.hash){const id=location.hash.slice(1);if(document.getElementById(id))go(id)}}
boot().catch(e=>{console.error(e);document.body.insertAdjacentHTML('beforeend',`<div class="startup-error" role="alert"><b>Human OS could not finish loading.</b><br>${String(e.message||e)}<br><small>Your saved account data has not been changed.</small></div>`)});
