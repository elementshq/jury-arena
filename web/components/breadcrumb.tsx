import Link from "next/link";

export interface BreadcrumbItem {
  id: string;
  label: string;
  href: string;
  isCurrent?: boolean;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-sm overflow-hidden"
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          className="flex items-center gap-1 text-muted-foreground"
        >
          {index > 0 && <span className="">/</span>}
          {item.isCurrent ? (
            <span aria-current="page" className="px-2 py-1 rounded ">
              {item.label}
            </span>
          ) : (
            <Link
              href={item.href}
              className="px-2 py-1 rounded transition-colors hover:bg-slate-100"
            >
              {item.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
