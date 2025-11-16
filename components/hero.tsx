"use client";

import Link from "next/link";
import { GL } from "./gl";
import { Pill } from "./pill";
import { Button } from "./ui/button";
import { useState } from "react";

export function Hero() {
  return (
    <div className="relative flex flex-col h-svh">
      <GL hovering />

      <div className="relative z-10 flex flex-col items-center justify-center h-full pb-16 text-center">
        <Pill className="mb-6">DIGITAL TWINS</Pill>
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-sentient">
          Walk through{" "}
          <span className="font-semibold italic">3D models</span>{" "}
          instantly
        </h1>
        <p className="font-mono text-sm sm:text-base text-foreground/60 text-balance mt-8 max-w-[440px] mx-auto">
          Experience and interact with physical space from a human perspective
        </p>

        <Link className="contents max-sm:hidden" href="/viewer">
          <div className="mt-14 inline-flex rounded-full shadow-[0_0_45px_rgba(255,255,255,0.45)] hover:shadow-[0_0_60px_rgba(255,255,255,0.55)] transition-shadow duration-300">
            <Button>OPEN VIEWER</Button>
          </div>
        </Link>
        <Link className="contents sm:hidden" href="/viewer">
          <div className="mt-14 inline-flex rounded-full shadow-[0_0_35px_rgba(255,255,255,0.4)] hover:shadow-[0_0_50px_rgba(255,255,255,0.5)] transition-shadow duration-300">
            <Button size="sm">OPEN VIEWER</Button>
          </div>
        </Link>
      </div>
    </div>
  );
}
