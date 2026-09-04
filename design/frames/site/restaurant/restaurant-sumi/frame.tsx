import photo from "shared/assets/restaurant/dining.jpg";
import { RestaurantShowcase } from "shared/ui/demo/restaurant/showcase";

export default function Frame() {
	return <RestaurantShowcase take="sumi" photo={photo} />;
}
