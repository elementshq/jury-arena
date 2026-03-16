"use client";

import { Lock } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

import { isDemo } from "@/lib/is-demo";

/**
 * Wraps interactive elements to disable them in demo mode.
 *
 * In demo mode: renders children as disabled with a tooltip explanation.
 * In app mode: renders children as-is (zero overhead).
 */
export function DemoDisabled({ children, className }: { children: React.ReactNode; className?: string }) {
	if (!isDemo) return children;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				{/* span wrapper needed so Radix Tooltip works on disabled buttons */}
				<span className={`inline-flex${className ? ` ${className}` : ""}`} tabIndex={0}>
					<div className={`pointer-events-none opacity-50${className ? ` ${className}` : ""}`}>{children}</div>
				</span>
			</TooltipTrigger>
			<TooltipContent side="bottom" className="flex items-center gap-1.5">
				<Lock className="h-3 w-3" />
				Demo mode — this feature is not available
			</TooltipContent>
		</Tooltip>
	);
}
