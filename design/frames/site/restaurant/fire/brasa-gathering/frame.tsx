import fire from "shared/assets/restaurant/fire.jpg";
import gathering from "shared/assets/restaurant/gathering.jpg";
import { FireRestaurant } from "shared/ui/demo/restaurant/fire";

export default function Frame() {
	return <FireRestaurant take="gathering" fire={fire} gathering={gathering} />;
}
