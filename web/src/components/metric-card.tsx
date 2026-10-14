"use client";

import { motion } from "framer-motion";
import { formatNumber, formatPercent } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export type Metric = {
  label: string;
  value: number;
  delta?: number;
  format?: "number" | "percent";
};

export function MetricCard({ metric, index = 0 }: { metric: Metric; index?: number }) {
  const positive = (metric.delta ?? 0) >= 0;
  const value =
    metric.format === "percent"
      ? `${metric.value.toFixed(1)}%`
      : formatNumber(metric.value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
    >
      <Card className="h-full">
        <CardContent className="space-y-3">
          <p className="text-xs text-muted">{metric.label}</p>
          <p className="text-2xl font-semibold tracking-tight text-ink">{value}</p>
          {metric.delta !== undefined ? (
            <p className={positive ? "text-xs text-success" : "text-xs text-danger"}>
              {formatPercent(metric.delta)} vs last week
            </p>
          ) : (
            <p className="text-xs text-muted">Live total</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
