import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function SectionLink(props: { href: string; label: string }) {
  const { href, label } = props;

  return (
    <div className="flex">
      <Link
        href={href}
        className="h-auto px-2 py-1 mt-1 text-sm rounded transition-colors hover:bg-slate-100 flex items-center justify-between"
      >
        {label}
        <ArrowRight className="ml-1 h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
