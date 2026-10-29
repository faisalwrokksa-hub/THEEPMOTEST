'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { NavIcon } from './NavIcon';

export function NavLink({ href, navKey, children }:
  { href: string; navKey: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === '/' ? path === '/' : path.startsWith(href);
  return (
    <Link href={href as Route} aria-current={active ? 'page' : undefined}
          /* The title is what a collapsed rail relies on. */
          title={typeof children === 'string' ? children : undefined}>
      <NavIcon k={navKey} />
      <span className="lbl">{children}</span>
    </Link>
  );
}
