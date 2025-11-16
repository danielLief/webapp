"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { MobileMenu } from "./mobile-menu";

const navLinks = [
  { label: "PRODUCTS", href: "#products" },
  { label: "SOLUTIONS", href: "#solutions" },
  { label: "LEARN", href: "#learn" },
  { label: "CONTACT", href: "#contact" },
];

export const Header = () => {
  const pathname = usePathname();
  const onViewerPage = pathname?.startsWith("/viewer");

  return (
    <div
      className={cn(
        "fixed z-50 top-0 left-0 w-full",
        onViewerPage
          ? "pt-4 md:pt-6 pb-4 md:pb-5 bg-black/95 backdrop-blur"
          : "pt-8 md:pt-14"
      )}
    >
      <header className="flex items-center justify-between container">
        <Link href="/">
          <Logo className="w-[110px] md:w-[130px]" />
        </Link>
        <nav className="flex max-lg:hidden absolute left-1/2 -translate-x-1/2 items-center justify-center gap-x-10">
          {navLinks.map((item) => (
            <Link
              className="uppercase inline-block font-mono text-foreground/60 hover:text-foreground/100 duration-150 transition-colors ease-out"
              href={item.href}
              key={item.label}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          className="uppercase max-lg:hidden transition-colors ease-out duration-150 font-mono text-white hover:text-white/80"
          href="/#sign-in"
        >
          Sign In
        </Link>
        <MobileMenu />
      </header>
    </div>
  );
};
