/**
 * Composition root of the device backend (the phone app's own database):
 * the modules' device sides, in the backend's order (`ENABLED_MODULES`).
 * It is a separate list from `index.ts` because the device backend runs in
 * a worker, without React; adding a module means one entry in each list.
 */
import type { DeviceModule } from "../core/device/server";
import { calendarDevice } from "./calendar/device";
import { habitsDevice } from "./habits/device";
import { knowledgeDevice } from "./knowledge/device";
import { todosDevice } from "./todos/device";

/** Every enabled module's device side. */
export const DEVICE_MODULES: readonly DeviceModule[] = [
  todosDevice,
  knowledgeDevice,
  calendarDevice,
  habitsDevice,
];
