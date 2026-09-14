"use client";

/*
 * PROTOTYPE ONLY — the Usage page as three switchable variants over dummy
 * data. `?variant=A|B|C` picks the layout; `?range=&cred=&resource=` are the
 * real controls. Replace this file with the real page when a variant wins.
 */

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PrototypeSwitcher } from "@/components/PrototypeSwitcher";
import { useFilters } from "./_prototype/Controls";
import { VariantA, name as nameA } from "./_prototype/VariantA";
import { VariantB, name as nameB } from "./_prototype/VariantB";
import { VariantC, name as nameC } from "./_prototype/VariantC";

const VARIANTS = ["A", "B", "C"];
const NAMES = { A: nameA, B: nameB, C: nameC };

function Inner() {
  const params = useSearchParams();
  const variant = params.get("variant") ?? "A";
  const [filters, set] = useFilters();
  return (
    <>
      {variant === "A" && <VariantA filters={filters} set={set} />}
      {variant === "B" && <VariantB filters={filters} set={set} />}
      {variant === "C" && <VariantC filters={filters} set={set} />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} names={NAMES} />
    </>
  );
}

export default function UsagePrototypePage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
