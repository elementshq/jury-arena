function SegmentedControl<T extends string>(props: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
      {props.options.map((opt) => {
        const active = opt.value === props.value;

        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => props.onChange(opt.value)}
            className={[
              "px-3 py-1.5 text-sm rounded-md transition font-medium",
              active
                ? "bg-white text-slate-900 font-medium"
                : "text-slate-600 hover:text-slate-900 font-medium",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
export { SegmentedControl };
