"use client";

import {
  TaskChooseOrganization,
  TaskResetPassword,
  TaskSetupMFA,
} from "@clerk/nextjs";
import { AuthFormPanel, AuthHeader, clerkTaskAppearance } from "./auth-shell";

export function SessionTaskPage({
  task,
}: {
  task: "choose-organization" | "reset-password" | "setup-mfa";
}) {
  const content =
    task === "choose-organization" ? (
      <TaskChooseOrganization
        redirectUrlComplete="/chat"
        appearance={clerkTaskAppearance}
      />
    ) : task === "reset-password" ? (
      <TaskResetPassword
        redirectUrlComplete="/chat"
        appearance={clerkTaskAppearance}
      />
    ) : (
      <TaskSetupMFA
        redirectUrlComplete="/chat"
        appearance={clerkTaskAppearance}
      />
    );

  return (
    <AuthFormPanel>
      <AuthHeader
        title="Un ultimo passaggio"
        description="Completa questa verifica di sicurezza per entrare in Anthon."
      />
      {content}
    </AuthFormPanel>
  );
}
