import React from "react";
import { CartProject } from "../../api/types";
import DefaultLogoImage from "../../../assets/default_logo.png";
import { Link } from "react-router-dom";
import {
  EyeIcon,
  LockClosedIcon,
  LockOpenIcon,
} from "@heroicons/react/24/solid";
import { renderToPlainText, VotingToken } from "common";
import { Input } from "common/src/styles";

export function ProjectInCart(
  props: React.ComponentProps<"div"> & {
    project: CartProject;
    index: number;
    projects: CartProject[];
    roundRoutePath: string;
    last?: boolean;
    selectedPayoutToken: VotingToken;
    payoutTokenPrice: number;
    removeProjectFromCart: (project: CartProject) => void;
    percentage: number; // New prop for percentage
    onPercentageChange: (index: number, newPercentage: number) => void; // New callback for percentage change
    isLocked: boolean; // New prop for lock state
    onLockToggle: (index: number) => void; // New callback for lock toggle
  }
) {
  const { project, roundRoutePath } = props;

  const focusedElement = document?.activeElement?.id;
  const inputID = "input-" + props.index;

  return (
    <div data-testid="cart-project">
      <div className="mb-4 flex flex-col lg:flex-row justify-between sm:px-2 px-2 py-4 rounded-md">
        <div className="flex">
          <div className="relative overflow-hidden bg-no-repeat bg-cover min-w-[64px] w-16 max-h-[64px] mt-auto mb-auto">
            <img
              className="inline-block rounded-full"
              src={
                props.project.projectMetadata?.logoImg
                  ? `https://${process.env.REACT_APP_PINATA_GATEWAY}/ipfs/${props.project.projectMetadata?.logoImg}`
                  : DefaultLogoImage
              }
              alt={"Project Logo"}
            />
            <Link to={`${roundRoutePath}/${project.grantApplicationId}`}>
              <div className="min-w-[64px] rounded-full w-16 max-h-[64px] absolute top-0 right-0 bottom-0 left-0 overflow-hidden bg-fixed opacity-0 hover:opacity-70 transition duration-300 ease-in-out bg-gray-500 justify-center flex items-center">
                <EyeIcon
                  className="fill-gray-200 w-6 h-6 cursor-pointer rounded-full"
                  data-testid={`${project.projectRegistryId}-project-link`}
                />
              </div>
            </Link>
          </div>

          <div className="pl-6 mt-1 flex flex-col">
            <Link
              to={`${roundRoutePath}/${project.grantApplicationId}`}
              data-testid={"cart-project-link"}
            >
              <p className="font-semibold text-lg mb-2 text-ellipsis line-clamp-1 max-w-[400px] 2xl:max-w-none">
                {props.project.projectMetadata?.title}
              </p>
            </Link>
            <p className="text-sm text-ellipsis line-clamp-3 max-w-[400px] 2xl:max-w-none">
              {renderToPlainText(
                props.project.projectMetadata?.description ?? ""
              ).substring(0, 130)}
            </p>
          </div>
        </div>

        <div className="flex sm:space-x-4 space-x-2 h-16 sm:pl-4 pt-3 justify-center">
          <div className="md:hidden sm:w-12"></div>
          <Input
            aria-label={
              "Donation percentage for project " +
              props.project.projectMetadata?.title
            }
            id={inputID}
            key={inputID}
            {...(focusedElement === inputID ? { autoFocus: true } : {})}
            min="0"
            max="100"
            value={props.percentage || 0}
            type="number"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              props.onPercentageChange(
                props.index,
                parseFloat(e.target.value) || 0
              )
            }
            className="w-[100px] sm:w-[80px] text-center border border-black"
          />
          <span className="m-auto">%</span>
          <p className="m-auto">{props.selectedPayoutToken?.name}</p>
          {props.payoutTokenPrice && (
            <div className="m-auto px-2 min-w-max flex flex-col">
              <span className="text-sm text-grey-400 ">
                ${" "}
                {((props.percentage / 100) * props.payoutTokenPrice).toFixed(2)}
              </span>
            </div>
          )}
          {props.isLocked ? (
            <LockClosedIcon
              onClick={() => props.onLockToggle(props.index)}
              className="w-5 h-5 m-auto cursor-pointer"
            />
          ) : (
            <LockOpenIcon
              onClick={() => props.onLockToggle(props.index)}
              className="w-5 h-5 m-auto cursor-pointer"
            />
          )}
        </div>
      </div>
      {!props.last && <hr className="border-b-[2px] border-grey-100 mx-4" />}
    </div>
  );
}
