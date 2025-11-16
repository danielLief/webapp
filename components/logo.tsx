import { cn } from "@/lib/utils";

interface LogoProps extends React.HTMLAttributes<HTMLSpanElement> {}

export const Logo = ({ className, ...props }: LogoProps) => {
  return (
    <span
      className={cn(
        "font-mono tracking-[0.2em] text-base md:text-lg text-white uppercase",
        className
      )}
      {...props}
    >
      REscan
    </span>
  );
};
