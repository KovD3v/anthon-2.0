import { PageWrapper } from "@/components/ui/page-wrapper";
import { CTA } from "./components/CTA";
import { Features } from "./components/Features";
import { Footer } from "./components/Footer";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { LandingMotion } from "./components/LandingMotion";
import { Testimonials } from "./components/Testimonials";

export default function MarketingPage() {
  return (
    <PageWrapper>
      <div className="flex min-h-[100dvh] flex-col">
        <main className="flex-1">
          <LandingMotion>
            <Hero />
            <Features />
            <HowItWorks />
            <Testimonials />
            <CTA />
          </LandingMotion>
        </main>
        <Footer />
      </div>
    </PageWrapper>
  );
}
