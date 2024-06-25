import { screen } from "@testing-library/react";
import ThankYou from "./ThankYou";
import { renderWithContext } from "../../test-utils";
import { expect } from "vitest";

vi.mock("wagmi", async () => {
  const actual = await vi.importActual<typeof import("wagmi")>("wagmi");
  return {
    ...actual,
    useAccount: () => ({
      address: "",
    }),
  };
});

describe.skip("<ThankYou/>", () => {
  it("Should show twitter, go back home, view your trasaction button", async () => {
    renderWithContext(<ThankYou />);

    expect(screen.queryByTestId("view-tx-button")).toBeInTheDocument();
    expect(screen.queryByTestId("home-button")).toBeInTheDocument();
  });
});
