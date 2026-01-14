"use client";

import React from "react";
import { Loader } from "@/components/ai-elements/loader";
import { useSpinnerDelay } from "../lib/useSpinnerDelay";

type LoadingIndicatorProps = {
  loading: boolean;
  label?: string;
};

export const LoadingIndicator = ({ loading, label }: LoadingIndicatorProps) => {
  const visible = useSpinnerDelay(loading);
  if (!visible) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <Loader size={16} />
      <span>{label ?? "Working..."}</span>
    </div>
  );
};
