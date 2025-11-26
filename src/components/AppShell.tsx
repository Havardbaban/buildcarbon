// src/components/AppShell.tsx
import React from "react";
import Nav from "./Nav";

type AppShellProps = {
  children: React.ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <div className="bc-shell">{children}</div>
    </div>
  );
}
