export async function functionFailure(result,context='Analysis'){
 let detail=result?.data;
 if(!detail&&result?.error?.context){try{detail=await result.error.context.clone().json()}catch{}}
 const code=detail?.error_code||'';
 const message=code==='AUTHORIZATION_ERROR'?'You do not have access to this engagement.':code==='DIAGNOSIS_PAYMENT_REQUIRED'?'Full Diagnosis requires the first engagement payment. Free Diagnosis and discovery coverage remain available.':`${context} is temporarily unavailable. Your uploaded evidence is safe. Please try again shortly.`;
 const error=new Error(message);error.code=code||'EDGE_FUNCTION_ERROR';error.requestId=detail?.request_id;return error;
}
