import photo from "shared/assets/restaurant/table.jpg";
import { RestaurantShowcase } from "shared/ui/demo/restaurant/showcase";

export default function Frame() {
	return <RestaurantShowcase take="ember" photo={photo} />;
}
