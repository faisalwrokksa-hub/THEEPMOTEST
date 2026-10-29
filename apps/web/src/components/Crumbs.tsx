'use client';
import { usePathname } from 'next/navigation';
import { NAV } from '@/lib/nav';

export function Crumbs({ ar }: { ar: boolean }) {
  const path = usePathname();
  let group = '', label = ar ? 'النظرة التنفيذية' : 'Executive Overview';
  for (const g of NAV) {
    for (const i of g.items) {
      const hit = i.href === '/' ? path === '/' : path.startsWith(i.href);
      if (hit) { group = ar ? g.ar : g.label; label = ar ? i.ar : i.label; }
    }
  }
  return (
    <div className="crumbs">
      <span>{ar ? 'المكتب التنفيذي لإدارة المشاريع' : 'The EPMO'}</span>
      {group && <><span className="sep">/</span><span>{group}</span></>}
      <span className="sep">/</span><b>{label}</b>
    </div>
  );
}
