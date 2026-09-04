import photo from "shared/assets/restaurant/courtyard.jpg";
import { RestaurantShowcase } from "shared/ui/demo/restaurant/showcase";

export default function Frame() {
	return <RestaurantShowcase take="olive" photo={photo} />;
}
