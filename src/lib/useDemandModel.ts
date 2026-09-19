"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchModelStatus, type ModelStatus } from "@/lib/modelApi";

export function useDemandModel() {
  const [status, setStatus] = useState<ModelStatus>({ status: "not_trained" });
  const [error, setError] = useState<string | null>(null);

  const applyStatus = useCallback((next: ModelStatus) => {
    setStatus(next);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchModelStatus()
      .then((next) => {
        if (!cancelled) applyStatus(next);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setStatus({ status: "not_trained" });
        setError(caught instanceof Error ? caught.message : "Cannot reach the training API.");
      });
    return () => {
      cancelled = true;
    };
  }, [applyStatus]);

  return {
    status,
    error,
    applyStatus,
  };
}
