import { cn } from "@/lib/utils";
import Image from "next/image";

interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Logo = ({ className, ...props }: LogoProps) => {
  return (
    <div
      className={cn(
        "relative",
        className
      )}
      {...props}
    >
      <Image
        src="/REscan Logo White.png"
        alt="Rescan Logo"
        width={130}
        height={40}
        className="w-full h-auto"
        priority
      />
    </div>
  );
};
