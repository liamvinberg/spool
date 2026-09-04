import photo from "shared/assets/restaurant/rigatoni.jpg";
import detail from "shared/assets/restaurant/wine.jpg";
import { RestaurantShowcase } from "shared/ui/demo/restaurant/showcase";

export default function Frame() {
	return <RestaurantShowcase take="sera" photo={photo} detail={detail} />;
}
