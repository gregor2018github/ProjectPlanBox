/**
 * Which PlanBox this is: the PC app (data on the PC's server) or the phone
 * app (`npm run build:device`, its own database in the app).
 */

/** True in the phone app, whose backend runs on the device itself. */
export const IS_DEVICE = import.meta.env.VITE_PLANBOX_DEVICE === "1";
