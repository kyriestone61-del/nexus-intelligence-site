export async function onRequestGet(){
 const response=await fetch('https://dmdgkjksouhhsuojthav.supabase.co/rest/v1/rpc/relystra_offer_ladder',{method:'POST',headers:{'content-type':'application/json',apikey:'sb_publishable_-bZLK1vmL0eUMz65A6EUsw_I20LBq2B'},body:'{}'});
 return new Response(await response.text(),{status:response.status,headers:{'content-type':'application/json','cache-control':'public,max-age=60'}});
}
