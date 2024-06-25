import React, { useEffect, useState, useCallback, useMemo } from "react";
import { ChainId } from "common";
import { groupProjectsInCart } from "../../api/utils";
import Footer from "common/src/components/Footer";
import Navbar from "../../common/Navbar";
import Breadcrumb, { BreadcrumbItem } from "../../common/Breadcrumb";
import { EmptyCart } from "./EmptyCart";
import { Header } from "./Header";
import { useCartStorage } from "../../../store";
import { CartWithProjects } from "./CartWithProjects";
import { useDataLayer } from "data-layer";
import { useMACIContributions } from "../../projects/hooks/useRoundMaciMessages";
import { useAccount } from "wagmi";
import { MACIContributionsByRoundId, GroupedCredits } from "../../api/types";

export default function ViewCart() {
  const { userProjects, setUserCart, removeUserProject } = useCartStorage();
  const { address: walletAddress } = useAccount();

  const projects = useMemo(
    () => (walletAddress ? userProjects[walletAddress] ?? [] : []),
    [userProjects, walletAddress]
  );

  const dataLayer = useDataLayer();

  const { data: maciContributions } = useMACIContributions(
    walletAddress?.toLowerCase() as string,
    dataLayer
  );

  const maciContributionsByChainId = Object.keys(
    maciContributions?.groupedMaciContributions ?? {}
  );

  const groupedCartProjects = groupProjectsInCart(projects);
  const groupedProjectsByChainId = Object.keys(groupedCartProjects);
  const combinedGroupedCartByChainId = Array.from(
    new Set([...groupedProjectsByChainId])
  );

  const breadCrumbs: BreadcrumbItem[] = [
    {
      name: "Explorer Home",
      path: "/",
    },
    {
      name: "Cart",
      path: `/cart`,
    },
  ];

  return (
    <>
      <Navbar />
      <div className="relative top-28 lg:mx-20 h-screen sm:px-4 px-2 py-7 lg:pt-0 font-sans">
        <div className="flex flex-col pb-4" data-testid="bread-crumbs">
          <Breadcrumb items={breadCrumbs} />
        </div>
        <main>
          <Header />
          <div className="flex flex-col md:flex-row gap-5">
            {!walletAddress || projects.length === 0 ? (
              <EmptyCart />
            ) : (
              <div className={"grid sm:grid-cols-2 gap-5 w-full mx-5"}>
                <div className="flex flex-col gap-5 sm:col-span-2 order-2 sm:order-1">
                  {combinedGroupedCartByChainId &&
                    projects.length > 0 &&
                    combinedGroupedCartByChainId.map((chainId) => (
                      <div key={Number(chainId)}>
                        <CartWithProjects
                          cart={groupedCartProjects[Number(chainId)]}
                          maciContributions={
                            (maciContributions?.groupedMaciContributions[
                              Number(chainId)
                            ] as MACIContributionsByRoundId) ?? null
                          }
                          chainId={Number(chainId) as ChainId}
                        />
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </main>
        <div className="my-11">
          <Footer />
        </div>
      </div>
    </>
  );
}
