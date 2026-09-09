// Hosted model probes complete within 120s. Reserve ten seconds for result
// validation/persistence and another ten below the platform's 150s ceiling.
export function diagnosisReportBudget(startedAt:number,now=Date.now()) {
  const remaining=130000-(now-startedAt);
  if(remaining<5000)throw new Error('DIAGNOSIS_PREPARATION_TIMEOUT');
  return Math.min(130000,remaining);
}
