"use client";

import { PageWrapper } from "@/components/ui/page-wrapper";
import { RoutineCollectionPage } from "../../components/RoutineCollectionPage";

export default function RoutineCollectionRoute() {
  return (
    <PageWrapper
      motion={false}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <RoutineCollectionPage />
    </PageWrapper>
  );
}
