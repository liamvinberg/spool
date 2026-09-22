import { OnboardingShort } from "shared/ui/explore/onboarding/short/short";

export default function Frame() {
	return <OnboardingShort initialStep={3} initialProject="existing" initialAgent="own" />;
}
