interface SavoryLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'icon';
  theme?: 'light' | 'dark';
  className?: string;
  showSubtitle?: boolean;
}

const sizeMap = {
  xs: { icon: 'w-7 h-7',  title: 'text-base  font-bold      tracking-tight', subtitle: 'text-[9px]  font-semibold tracking-wider' },
  sm: { icon: 'w-8 h-8',  title: 'text-lg    font-bold      tracking-tight', subtitle: 'text-[10px] font-semibold tracking-wider' },
  md: { icon: 'w-10 h-10', title: 'text-xl   font-extrabold tracking-tight', subtitle: 'text-[11px] font-semibold tracking-wider' },
  lg: { icon: 'w-14 h-14', title: 'text-3xl  font-extrabold tracking-tight', subtitle: 'text-xs     font-semibold tracking-wider' },
  xl: { icon: 'w-20 h-20', title: 'text-4xl  font-extrabold tracking-tight', subtitle: 'text-sm     font-semibold tracking-wider' },
} as const;

export default function SavoryLogo({
  size = 'md',
  variant = 'full',
  theme = 'light',
  className = '',
  showSubtitle = true,
}: SavoryLogoProps) {
  const { icon: iconCls, title: titleCls, subtitle: subtitleCls } = sizeMap[size];
  const textColor    = theme === 'dark' ? 'text-white'    : 'text-slate-900';
  const subtitleColor = theme === 'dark' ? 'text-orange-300' : 'text-orange-500';

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {/* Real logo.png — the official Savory brand icon */}
      <img
        src="/logo.png"
        alt="Savory logo"
        className={`${iconCls} rounded-2xl object-cover shrink-0 drop-shadow-md`}
      />

      {/* Wordmark — only shown when variant="full" */}
      {variant === 'full' && (
        <div className="flex flex-col leading-tight">
          <span className={`${titleCls} ${textColor}`}>Savory</span>
          {showSubtitle && (
            <span className={`${subtitleCls} ${subtitleColor} uppercase`}>
              Food &amp; Restaurant
            </span>
          )}
        </div>
      )}
    </div>
  );
}
