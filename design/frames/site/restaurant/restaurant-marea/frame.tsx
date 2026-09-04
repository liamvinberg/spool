import photo from "shared/assets/restaurant/garden.jpg";
import { RestaurantShowcase } from "shared/ui/demo/restaurant/showcase";

export default function Frame() {
	return <RestaurantShowcase take="marea" photo={photo} />;
}
