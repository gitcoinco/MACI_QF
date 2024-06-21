import { useMemo } from "react";
import { CartProject } from "../../api/types";
import { CollectionShareButtonContainer } from "../CollectionShareDialog";

export function Header(props: { projects: CartProject[] }) {
  const applications = useMemo(
    () =>
      props.projects.map((p: CartProject) => ({
        chainId: p.chainId,
        roundId: p.roundId,
        id: p.grantApplicationId,
      })),

    [props.projects]
  );

  return (
    <div>
      <div className="flex mt-5 border-b-2 pb-2">
        <h1 className="grow text-3xl">Cart</h1>
        {/* <div>
          <CollectionShareButtonContainer
            showOnlyInAlloVersion="allo-v2"
            applications={applications}
          />
        </div> */}
      </div>

      <p className="mt-6 leading-6">Your donations are secured and anonymous with MACI(Minimal Anti-Collusion Infrastructure). With MACI, your donations are encrypted and kept private ensuring secure transactions 🔒🌐 🛒</p>
      <p className="mt-2 mb-5 leading-6">
        You have full control over how your donation is distributed among various projects, and you can adjust your donation distribution anytime before the round ends.
      </p>
    </div>
  );
}
