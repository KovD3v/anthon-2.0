export type StripeBillingSummary = {
  subscription: {
    plan:
      | "basic"
      | "basic_plus"
      | "pro"
      | "basic_annual"
      | "basic_plus_annual"
      | "pro_annual";
    name: string;
    amount: number;
    currency: "eur";
    interval: "month" | "year";
    status: string;
    currentPeriodEnd: number;
    cancelAtPeriodEnd: boolean;
  } | null;
  paymentMethod: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
  invoices: Array<{
    id: string;
    number: string | null;
    date: number;
    amount: number;
    currency: string;
    status: string | null;
    downloadUrl: string | null;
  }>;
};
