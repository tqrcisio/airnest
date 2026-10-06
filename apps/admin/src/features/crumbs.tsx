import { Fragment } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@airnest/ui/components/breadcrumb';

type Crumb = { label: string; to?: string; params?: Record<string, string> };

export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => (
          <Fragment key={item.label}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {item.to ? (
                <BreadcrumbLink render={<Link to={item.to} params={item.params} />}>{item.label}</BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function SectionHeading({ children }: { children: string }) {
  return <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{children}</h2>;
}

export function PageState({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'error' }) {
  return (
    <p className={`py-10 text-center text-sm ${tone === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
      {text}
    </p>
  );
}
