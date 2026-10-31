'use client';
import { useState } from 'react';
import { makeDeploymentDraft } from '@/lib/deployment-planning.mjs';

export function DeploymentPlanner({workspace,lang}:{workspace:string;lang:'ar'|'en'}) {
  const ar=lang==='ar';
  const tx=(en:string,arabic:string)=>ar?arabic:en;
  const [profile,setProfile]=useState<'shared'|'dedicated'>('shared');
  const [organizationType,setOrganizationType]=useState('private');
  const [classification,setClassification]=useState('undetermined');
  const [privateIngress,setPrivateIngress]=useState(false);
  const [result,setResult]=useState('');
  const [error,setError]=useState('');
  function prepare(){
    try {
      const draft=makeDeploymentDraft({workspace,profile,organizationType,classification,privateIngress});
      setResult(JSON.stringify(draft,null,2));setError('');
    } catch {setResult('');setError(tx('Invalid deployment preferences.','خيارات الاستضافة غير صالحة.'));}
  }
  return <section className="panel" aria-label={tx('Deployment preferences','تفضيلات الاستضافة')}>
    <h2>{tx('Select hosting profile','اختر نوع الاستضافة')}</h2>
    <div style={{display:'grid',gap:14,maxWidth:680}}>
      <fieldset><legend>{tx('Deployment model','نموذج الاستضافة')}</legend>
        <label style={{display:'block'}}><input type="radio" name="deploymentProfile" checked={profile==='shared'} onChange={()=>{setProfile('shared');setPrivateIngress(false);}} /> {tx('Shared Saudi SaaS (requested only)','خدمة سحابية سعودية مشتركة (طلب فقط)')}</label>
        <label style={{display:'block'}}><input type="radio" name="deploymentProfile" checked={profile==='dedicated'} onChange={()=>setProfile('dedicated')} /> {tx('Dedicated government/enterprise environment (review required)','بيئة مخصصة للجهات الحكومية والمؤسسات (تتطلب مراجعة)')}</label>
      </fieldset>
      <label>{tx('Organization category','فئة المؤسسة')}
        <select value={organizationType} onChange={e=>setOrganizationType(e.target.value)}>
          <option value="private">{tx('Private enterprise','قطاع خاص')}</option><option value="government">{tx('Government','جهة حكومية')}</option><option value="nonprofit">{tx('Nonprofit','غير ربحي')}</option>
        </select>
      </label>
      <label>{tx('Data classification for security review','تصنيف البيانات للمراجعة الأمنية')}
        <select value={classification} onChange={e=>setClassification(e.target.value)}>
          <option value="undetermined">{tx('Not assessed','غير محدد')}</option><option value="public">{tx('Public','عام')}</option><option value="internal">{tx('Internal','داخلي')}</option><option value="confidential">{tx('Confidential','سري')}</option><option value="restricted">{tx('Restricted','مقيد')}</option>
        </select>
      </label>
      {profile==='dedicated'&&<label><input type="checkbox" checked={privateIngress} onChange={e=>setPrivateIngress(e.target.checked)}/> {tx('Request private network ingress review','طلب مراجعة وصول الشبكة الخاصة')}</label>}
      <p className="dim">{tx('Lifecycle: local draft → requested → approved → provisioning → active. Only the provider and authorized operators can advance states; this screen cannot submit or approve requests.','المراحل: مسودة محلية ← مطلوب ← معتمد ← قيد التجهيز ← نشط. الانتقال بين الحالات من اختصاص المشغلين المخولين فقط، ولا ترسل هذه الشاشة الطلب أو تعتمده.')}</p>
      <button type="button" onClick={prepare}>{tx('Prepare local review draft','إعداد مسودة محلية للمراجعة')}</button>
      {error&&<p role="alert">{error}</p>}
      {result&&<div role="status"><p>{tx('Draft generated locally. Copy it to your authorized deployment review process; no request was submitted.','تم إعداد المسودة محلياً. انسخها لإجراءات المراجعة المعتمدة؛ لم يُرسل أي طلب.')}</p><textarea readOnly aria-label={tx('Planning draft JSON','مسودة التخطيط')} value={result} rows={12} style={{width:'100%',fontFamily:'monospace',direction:'ltr'}}/></div>}
    </div>
  </section>;
}
