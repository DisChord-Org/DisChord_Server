import { createMiddleware } from "seyfert";
import TrustUsersService from "../utils/libraries/TrustUsersService";

export const trustUserMiddleware = createMiddleware<void>(
    async (middle) => {
        if (!TrustUsersService.existsUser(middle.context.author.id)) return middle.context.write({ content: 'Para ejecutar este comando debes estar validado en el servidor.' });

        return middle.next();
    }
);