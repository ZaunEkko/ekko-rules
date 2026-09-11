/**
 * An open deployment keeps no profiles, so the stored-address endpoints do not
 * exist there at all. 404 rather than 403: there is nothing behind them.
 */
export const STATELESS_ONLY_MESSAGE =
  "This deployment stores no profiles. Use /sub with query parameters.";
