/** The PlanBox version (package.json), equal to the Python package's. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** "1" in the phone app's build (`npm run build:device`). */
  readonly VITE_PLANBOX_DEVICE?: string;
}
