"use client";

import React from "react";
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
    <div className="loading">
      <span className="spinner" />
      <span>{label ?? "Working..."}</span>
    </div>
  );
};
