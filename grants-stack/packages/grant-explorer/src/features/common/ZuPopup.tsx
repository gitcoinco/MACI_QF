import { usePopup } from "zupass-auth";
// NEW CODE
/**
 * This popup sends requests and receives PCDs from the passport.
 */
// TODO: Fix the flickering
export default function Popup() {
  const error = usePopup();

  return <div className="absolute w-100 h-100 bg-white">{error}</div>;
}
