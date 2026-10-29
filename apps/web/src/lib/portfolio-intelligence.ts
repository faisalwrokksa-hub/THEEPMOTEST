/** Explainable portfolio signals derived only from tenant-authorized aggregate
 * snapshots. No cross-tenant benchmarks, finance, PII, or ML predictions. */
export type Snapshot = {onDate:string;projects:number;onTrack:number;atRisk:number;critical:number;avgProgress:number;gatesBlocked:number;openRegister:number};
export type Signal = {key:string;direction:'improving'|'deteriorating'|'stable'|'unavailable';change:number|null;from:string|null;to:string|null;explanation:string;source:'/analytics';};
const measures = [
  {key:'Critical projects',field:'critical',inverse:true},
  {key:'At-risk projects',field:'atRisk',inverse:true},
  {key:'Average progress',field:'avgProgress',inverse:false},
  {key:'Blocked gates',field:'gatesBlocked',inverse:true},
  {key:'Open register items',field:'openRegister',inverse:true},
] as const;
function validDate(s:string){return /^\d{4}-\d\d-\d\d$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));}
export function portfolioSignals(input:unknown):{signals:Signal[];sampleDays:number;confidence:'insufficient'|'limited'|'observational';note:string} {
  const data = Array.isArray(input) ? input : [];
  const history:Snapshot[] = data.filter((s):s is Snapshot=> !!s && typeof s === 'object' && validDate(s.onDate) && measures.every(m=>Number.isFinite(s[m.field]) && s[m.field]>=0) && Number.isFinite(s.projects) && s.projects>=0)
    .slice().sort((a,b)=>a.onDate.localeCompare(b.onDate));
  const unique = [...new Map(history.map(s=>[s.onDate,s])).values()];
  const first=unique[0],last=unique.at(-1);
  const span= first&&last ? Math.round((Date.parse(last.onDate)-Date.parse(first.onDate))/86400000) : 0;
  const sufficient=unique.length>=7&&span>=6;
  const signals:Signal[]=measures.map(m=>{
    const base={key:m.key,from:first?.onDate??null,to:last?.onDate??null,source:'/analytics' as const};
    if(!sufficient) return {...base,direction:'unavailable' as const,change:null,explanation:'Insufficient dated snapshots; no direction or forecast inferred.'};
    const change=Number((last[m.field]-first[m.field]).toFixed(2));
    const direction:Signal['direction']=change===0?'stable':(change>0)===m.inverse?'deteriorating':'improving';
    return {...base,direction,change,explanation:`Observed ${m.key.toLowerCase()} moved from ${first[m.field]} to ${last[m.field]} over ${span} calendar days. This is historical change, not a future forecast.`};
  });
  return {signals,sampleDays:unique.length,confidence:!sufficient?'insufficient':unique.length<14?'limited':'observational',note:'Internal historical comparison only; not a peer benchmark or predictive model. Portfolio membership can change between snapshots.'};
}
