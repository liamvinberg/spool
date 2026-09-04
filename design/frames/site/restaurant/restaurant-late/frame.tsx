import photo from "shared/assets/restaurant/wine.jpg";
import { RestaurantShowcase } from "shared/ui/demo/restaurant/showcase";

export default function Frame() {
	return <RestaurantShowcase take="late" photo={photo} />;
}
