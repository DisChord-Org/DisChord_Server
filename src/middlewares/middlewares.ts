import { staffMiddleware } from "./staff.middleware";
import { trustUserMiddleware } from "./trustuser.middleware";

export const middlewares = {
    staff: staffMiddleware,
    trustuser: trustUserMiddleware
}