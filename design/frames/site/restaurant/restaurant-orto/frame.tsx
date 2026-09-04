import photo from "shared/assets/restaurant/rigatoni.jpg";
import { RestaurantShowcase } from "shared/ui/demo/restaurant/showcase";

export default function Frame() {
	return <RestaurantShowcase take="orto" photo={photo} />;
}
