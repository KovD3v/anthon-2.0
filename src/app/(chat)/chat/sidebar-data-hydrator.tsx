"use client";

import { useEffect } from "react";
import { type ChatSidebarHydrationData, useChatContext } from "./layout-client";

export function SidebarDataHydrator({
  data,
}: {
  data: ChatSidebarHydrationData;
}) {
  const { hydrateSidebarData } = useChatContext();

  useEffect(() => {
    hydrateSidebarData(data);
  }, [data, hydrateSidebarData]);

  return null;
}
