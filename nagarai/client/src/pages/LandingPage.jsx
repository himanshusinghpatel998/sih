import ScrollProgress from '../components/landing/ScrollProgress';
import CursorGlow from '../components/landing/CursorGlow';
import LandingNav from '../components/landing/LandingNav';
import HeroSection from '../components/landing/HeroSection';
import MarqueeStrip from '../components/landing/MarqueeStrip';
import TaglineReveal from '../components/landing/TaglineReveal';
import HowItWorks from '../components/landing/HowItWorks';
import RoleStrip from '../components/landing/RoleStrip';
import FaqSection from '../components/landing/FaqSection';
import FinalCta from '../components/landing/FinalCta';
import LandingFooter from '../components/landing/LandingFooter';

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <CursorGlow />
      <ScrollProgress />
      <LandingNav />
      <main className="relative">
        <HeroSection />
        <MarqueeStrip />
        <TaglineReveal />
        <HowItWorks />
        <RoleStrip />
        <FaqSection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
