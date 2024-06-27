import { Listbox, Transition } from "@headlessui/react";
import {
  CheckIcon,
  InformationCircleIcon,
  SelectorIcon,
} from "@heroicons/react/solid";
import { yupResolver } from "@hookform/resolvers/yup";
import { classNames } from "common";
import { Input } from "common/src/styles";
import _ from "lodash";
import { Fragment, useContext, useEffect, useState } from "react";
import {
  Control,
  FieldErrors,
  SubmitHandler,
  useForm,
  useFormContext,
  FormProvider,
  UseFormRegisterReturn,
  useController,
} from "react-hook-form";

import ReactTooltip from "react-tooltip";
import * as yup from "yup";
import { Round } from "../api/types";
import { useWallet } from "../common/Auth";
import { FormStepper } from "../common/FormStepper";
import { FormContext } from "../common/FormWizard";
import { getPayoutTokenOptions, PayoutToken } from "../api/payoutTokens";

import TagsInput from "react-tagsinput";

interface QuadraticFundingFormProps {
  stepper: typeof FormStepper;
}

export const FundingValidationSchema = yup.object().shape({
  roundMetadata: yup.object().shape({
    quadraticFundingConfig: yup.object({
      matchingFundsAvailable: yup
        .number()
        .typeError("Matching funds available must be a valid number.")
        .moreThan(0, "Matching funds available must be more than zero."),
      matchingCap: yup
        .boolean()
        .required("You must select if you want a matching cap for projects."),
      matchingCapAmount: yup
        .number()
        .transform((value) => (isNaN(value) ? 0 : value))
        .when("matchingCap", {
          is: true,
          then: yup
            .number()
            .required("You must provide an amount for the matching cap.")
            .moreThan(0, "Matching cap amount must be more than zero.")
            .max(
              100,
              "Matching cap amount must be less than or equal to 100%."
            ),
        }),
      minDonationThreshold: yup
        .boolean()
        .required("You must select if you want a minimum donation threshold."),
      minDonationThresholdAmount: yup
        .number()
        .transform((value) => (isNaN(value) ? 0 : value))
        .when("minDonationThreshold", {
          is: true,
          then: yup
            .number()
            .required(
              "You must provide an amount for the minimum donation threshold."
            )
            .moreThan(0, "Minimum donation threshold must be more than zero."),
        }),
      sybilDefense: yup
        .boolean()
        .required("You must select if you want to use sybil defense."),
    }),
    maciParameters: yup.object().shape({
      maxContributionAmountAllowlisted: yup
        .number()
        .min(0, "Amount must be greater than or equal to 0")
        .required("Amount is required"),
      maxContributionAmountNonAllowlisted: yup
        .number()
        .min(0, "Amount must be greater than or equal to 0")
        .required("Amount is required"),
    }),
  }),
  token: yup
    .string()
    .required("You must select a payout token for your round.")
    .notOneOf(
      ["Choose Payout Token"],
      "You must select a payout token for your round."
    ),
});

export default function QuadraticFundingForm(props: QuadraticFundingFormProps) {
  const { currentStep, setCurrentStep, stepsCount, formData, setFormData } =
    useContext(FormContext);
  const initialQuadraticFundingConfig: Round["roundMetadata"]["quadraticFundingConfig"] =
    // @ts-expect-error Needs refactoring/typing as a whole
    formData?.roundMetadata.quadraticFundingConfig ?? {
      matchingFundsAvailable: 0,
      matchingCap: false,
      minDonationThreshold: false,
      sybilDefense: true,
    };

  const initialMACIConfig: Round["roundMetadata"]["maciParameters"] =
    // @ts-expect-error Needs refactoring/typing as a whole
    formData?.roundMetadata.maciParameters ?? {
      maxContributionAmountAllowlisted: "",
      maxContributionAmountNonAllowlisted: "",
      validEventIDs: [],
      coordinatorAddress:
        // @ts-expect-error Needs refactoring/typing as a whole
        formData?.roundMetadata.maciParameters.coordinatorAddress ?? "",
      coordinatorKeyPair:
        // @ts-expect-error Needs refactoring/typing as a whole
        formData?.roundMetadata.maciParameters.coordinatorKeyPair ?? "",
    };

  const { chain } = useWallet();
  const payoutTokenOptions: PayoutToken[] = [
    {
      name: "Choose Payout Token",
      chainId: chain.id,
      address: "0x0",
      default: true,
      decimal: 0,
    },
    ...getPayoutTokenOptions(chain.id),
  ];

  const methods = useForm<Round>({
    defaultValues: {
      ...formData,
      roundMetadata: {
        quadraticFundingConfig: initialQuadraticFundingConfig,
        maciParameters: initialMACIConfig,
      },
    },
    resolver: yupResolver(FundingValidationSchema),
  });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    watch,
  } = methods;

  const FormStepper = props.stepper;

  const next: SubmitHandler<Round> = async (values) => {
    const data = _.merge(formData, values);
    setFormData(data);
    setCurrentStep(currentStep + 1);
  };
  const prev = () => setCurrentStep(currentStep - 1);

  return (
    <FormProvider {...methods}>
      <div>
        <div className="md:grid md:grid-cols-3 md:gap-10">
          <LeftSidebar />

          <div className="mt-5 md:mt-0 md:col-span-2">
            <form
              onSubmit={handleSubmit(next, (errors) => {
                console.log(errors);
              })}
              className="shadow-sm text-grey-500"
            >
              {/* QF Settings */}
              <div className="p-6 bg-white">
                <p className="text-grey-400 mb-4">Quadratic Funding Settings</p>
                <div className="grid grid-cols-6 gap-6">
                  <PayoutTokenDropdown
                    register={register("token")}
                    errors={errors}
                    control={control}
                    payoutTokenOptions={payoutTokenOptions}
                  />
                  <MatchingFundsAvailable
                    errors={errors}
                    register={register(
                      "roundMetadata.quadraticFundingConfig.matchingFundsAvailable",
                      {
                        valueAsNumber: true,
                      }
                    )}
                    token={watch("token")}
                    payoutTokenOptions={payoutTokenOptions}
                  />
                </div>
              </div>

              {/* Sybil Defense */}
              <div className="p-6 bg-white">
                <p className="text-grey-400 mt-1 text-sm">
                  Ensure that project supporters are not bots or sybil with
                  ZuPass. Learn more about ZuPass{" "}
                  <a
                    href="https://zupass.org/"
                    className="text-violet-300"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    here
                  </a>
                  .
                </p>
                <div className="flex">
                  <SybilDefense
                    registerLimitAllowlisted={register(
                      "roundMetadata.maciParameters.maxContributionAmountAllowlisted"
                    )}
                    registerLimitNonAllowlisted={register(
                      "roundMetadata.maciParameters.maxContributionAmountNonAllowlisted"
                    )}
                    errors={errors}
                  />
                </div>
              </div>

              {/* FormStepper */}
              <div className="px-6 align-middle py-3.5 shadow-md">
                <FormStepper
                  currentStep={currentStep}
                  stepsCount={stepsCount}
                  prev={prev}
                />
              </div>
            </form>
          </div>
        </div>
      </div>
    </FormProvider>
  );
}

function LeftSidebar() {
  return (
    <div className="md:col-span-1">
      <p className="text-base leading-6">Funding Settings</p>
      <p className="mt-1 text-sm text-grey-400">
        What is the Round name, when do applications open/close, and when does
        it start and end?
      </p>
      <p className="mt-1 text-sm text-grey-400 pt-4">
        You can change this settings anytime before the round starts. Learn more
        about QF <a href="https://wtfisqf.com">here</a>.
      </p>
    </div>
  );
}

function PayoutTokenButton(props: {
  errors: FieldErrors<Round>;
  token?: PayoutToken;
}) {
  const { token } = props;
  return (
    <Listbox.Button
      className={`relative w-full cursor-default rounded-md border h-10 ${
        props.errors.token
          ? "border-red-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm text-red-900 placeholder-red-300 focus-within:outline-none focus-within:border-red-500 focus-within: ring-red-500"
          : "border-gray-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
      }`}
      data-testid="payout-token-select"
    >
      <span className="flex items-center">
        {token?.logo ? (
          <img
            src={token?.logo}
            alt=""
            className="h-6 w-6 flex-shrink-0 rounded-full"
          />
        ) : null}
        {token?.default ? (
          <span className="ml-3 block truncate text-gray-400">
            {token?.name}
          </span>
        ) : (
          <span className="ml-3 block truncate">{token?.name}</span>
        )}
      </span>
      <span className="pointer-events-none absolute inset-y-0 right-0 ml-3 flex items-center pr-2">
        <SelectorIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
      </span>
    </Listbox.Button>
  );
}

export function PayoutTokenInformation() {
  return (
    <>
      <InformationCircleIcon
        data-tip
        data-background-color="#0E0333"
        data-for="payout-token-tooltip"
        className="inline h-4 w-4 ml-2 mr-3 mb-1"
        data-testid={"payout-token-tooltip"}
      />
      <ReactTooltip
        id="payout-token-tooltip"
        place="bottom"
        type="dark"
        effect="solid"
      >
        <p className="text-xs">
          The payout token is the token <br />
          that you will use to distribute <br />
          matching funds to your grantees.
        </p>
      </ReactTooltip>
    </>
  );
}

function PayoutTokenDropdown(props: {
  register: UseFormRegisterReturn<string>;
  errors: FieldErrors<Round>;
  control: Control<Round>;
  payoutTokenOptions: PayoutToken[];
}) {
  const { field } = useController({
    name: "token",
    defaultValue: props.payoutTokenOptions[0].address,
    control: props.control,
    rules: {
      required: true,
    },
  });
  return (
    <div className="relative col-span-6 sm:col-span-3">
      <Listbox {...field}>
        {({ open }) => (
          <div>
            <Listbox.Label className="block text-sm">
              <span>Payout Token</span>
              <span className="text-right text-violet-400 float-right text-xs mt-1">
                *Required
              </span>
              <PayoutTokenInformation />
            </Listbox.Label>
            <div className="mt-1 mb-2 shadow-sm block rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
              <PayoutTokenButton
                errors={props.errors}
                token={props.payoutTokenOptions.find(
                  (t) => t.address === field.value
                )}
              />
              <Transition
                show={open}
                as={Fragment}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <Listbox.Options className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                  {props.payoutTokenOptions.map(
                    (token) =>
                      !token.default && (
                        <Listbox.Option
                          key={token.name}
                          className={({ active }) =>
                            classNames(
                              active
                                ? "text-white bg-indigo-600"
                                : "text-gray-900",
                              "relative cursor-default select-none py-2 pl-3 pr-9"
                            )
                          }
                          value={token.address}
                          data-testid="payout-token-option"
                        >
                          {({ selected, active }) => (
                            <>
                              <div className="flex items-center">
                                {token.logo ? (
                                  <img
                                    src={token.logo}
                                    alt=""
                                    className="h-6 w-6 flex-shrink-0 rounded-full"
                                  />
                                ) : null}
                                <span
                                  className={classNames(
                                    selected ? "font-semibold" : "font-normal",
                                    "ml-3 block truncate"
                                  )}
                                >
                                  {token.name}
                                </span>
                              </div>

                              {selected ? (
                                <span
                                  className={classNames(
                                    active ? "text-white" : "text-indigo-600",
                                    "absolute inset-y-0 right-0 flex items-center pr-4"
                                  )}
                                >
                                  <CheckIcon
                                    className="h-5 w-5"
                                    aria-hidden="true"
                                  />
                                </span>
                              ) : null}
                            </>
                          )}
                        </Listbox.Option>
                      )
                  )}
                </Listbox.Options>
              </Transition>
            </div>
            {props.errors.token && (
              <p className="mt-2 text-xs text-pink-500">
                {props.errors.token?.message}
              </p>
            )}
          </div>
        )}
      </Listbox>
    </div>
  );
}

function MatchingFundsAvailable(props: {
  register: UseFormRegisterReturn<string>;
  errors: FieldErrors<Round>;
  token: string;
  payoutTokenOptions: PayoutToken[];
}) {
  // not sure why UseFormRegisterReturn only takes strings for react-hook-form
  return (
    <div className="col-span-6 sm:col-span-3">
      <div className="flex justify-between">
        <label htmlFor="matchingFundsAvailable" className="text-sm">
          Matching Funds Available
        </label>
        <span className="text-right text-violet-400 float-right text-xs mt-1">
          *Required
        </span>
      </div>

      <div className="relative mt-1 rounded-md shadow-sm">
        <Input
          {...props.register}
          className={
            "block w-full rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm h-10"
          }
          type="number"
          id={"roundMetadata.matchingFunds.matchingFundsAvailable"}
          $hasError={
            props.errors?.roundMetadata?.quadraticFundingConfig
              ?.matchingFundsAvailable
          }
          placeholder="Enter the amount in chosen payout token."
          data-testid="matching-funds-available"
          aria-describedby="price-currency"
          step="any"
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 pr-10 flex items-center">
          <span className="text-gray-400 sm:text-sm">
            {
              props.payoutTokenOptions.find(
                (token) => token.address === props.token
              )?.name
            }
          </span>
        </div>
      </div>
      {props.errors.roundMetadata?.quadraticFundingConfig
        ?.matchingFundsAvailable && (
        <p className="text-xs text-pink-500">
          {
            props.errors.roundMetadata?.quadraticFundingConfig
              ?.matchingFundsAvailable.message
          }
        </p>
      )}
    </div>
  );
}

import { ZuzaluEvents } from "../../constants";
import { uuidToBigInt } from "@pcd/util";

function SybilDefense({
  registerLimitAllowlisted,
  registerLimitNonAllowlisted,
  errors,
}: {
  registerLimitAllowlisted: UseFormRegisterReturn<string>;
  registerLimitNonAllowlisted: UseFormRegisterReturn<string>;
  errors: FieldErrors<Round>;
}) {
  const { setValue } = useFormContext<Round>();
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const handleEventSelection = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const eventId = event.target.value;
    if (eventId && !selectedEvents.includes(eventId)) {
      const updatedEvents = [...selectedEvents, eventId];

      setSelectedEvents(updatedEvents);
    }
  };

  useEffect(() => {
    const formUpdateData = selectedEvents.map((event) => {
      return {
        eventID: uuidToBigInt(event).toString(),
      };
    });
    setValue("roundMetadata.maciParameters.validEventIDs", formUpdateData);

    // note: is there a reason to omit setValue from the dep array?
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvents]);

  return (
    <div className="flex flex-col float-rigth w-full">
      <div className="mt-1 mb-3 text-sm text-grey-400">
        <div className="text-base">
          Valid Events for MACI are required to prevent spam and fraud
        </div>
        <p className="text-sm mt-0.5">
          Valid Events are used to create an allowlist of privileged voters
        </p>
      </div>

      <p className="text-sm mb-2">
        <span>Define valid Zuzalu events</span>
        <span className="text-right text-violet-400 float-right text-xs mt-1">
          *Required
        </span>
      </p>
      <div className="flex flex-row sm:items-center sm:space-x-4 mb-3">
        <select
          className="my-auto w-2/6 mt-1 mb-2 shadow-sm block rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          onChange={handleEventSelection}
        >
          <option value="">Select an event</option>
          {ZuzaluEvents.map((event) => (
            <option key={event.eventId} value={event.eventId}>
              {event.eventName}
            </option>
          ))}
        </select>

        <div className="w-4/6 my-auto ">
          <TagsInput
            value={selectedEvents.map(
              (eventId) =>
                ZuzaluEvents.find((event) => event.eventId === eventId)
                  ?.eventName || ""
            )}
            onChange={(tags) => {
              const updatedEvents = tags.map((tag) =>
                ZuzaluEvents.find(
                  (event) => event.eventName === tag && event.eventId !== ""
                )
              );
              setSelectedEvents(
                updatedEvents.map((event) => event?.eventId || "")
              );
            }}
            inputProps={{ placeholder: "" }}
            onlyUnique={true}
            // renderTag={({ tag, key, onRemove, ...props }) => (
            //   <span
            //     key={key}
            //     {...props}
            //     className="bg-gray-200 rounded-md p-2 my-auto mx-auto flex items-center justify-between gap-2 cursor-pointer"
            //     onClick={() => onRemove(key)}
            //   >
            //     {tag}
            //     <button
            //       type="button"
            //       className="text-red-500 hover:text-red-700"
            //     >
            //       &times;
            //     </button>
            //   </span>
            // )}
            // renderLayout={(tagComponents, inputComponent) => (
            //   <div className="mt-1 mb-2 shadow-sm block rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm flex flex-wrap gap-2">
            //     {tagComponents}
            //     {inputComponent}
            //   </div>
            // )}
          />
        </div>
      </div>

      <div className="flex flex-col items-right w-full">
        <div>
          <div className="flex justify-between">
            <label htmlFor="matchingFundsAvailable" className="text-sm">
              Max Contribution Amount (Allowlisted Users)
            </label>
            <span className="text-right text-violet-400 float-right text-xs mt-1">
              *Required
            </span>
          </div>

          <Input
            {...registerLimitAllowlisted}
            className={
              "block w-full rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm h-10"
            }
            type="number"
            id={"roundMetadata.maciParameters.maxContributionAmountAllowlisted"}
            $hasError={
              errors?.roundMetadata?.maciParameters
                ?.maxContributionAmountAllowlisted
            }
            placeholder="Enter the amount."
            data-testid="matching-funds-available"
            aria-describedby="price-currency"
            step="any"
          />
        </div>
      </div>
      <div>
        <div className="flex justify-between">
          <label htmlFor="matchingFundsAvailable" className="text-sm">
            Max Contribution Amount (Non Allowlisted Users)
          </label>
          <span className="text-right text-violet-400 float-right text-xs mt-1">
            *Required
          </span>
        </div>

        <Input
          {...registerLimitNonAllowlisted}
          className={
            "block w-full rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm h-10"
          }
          type="number"
          id={
            "roundMetadata.maciParameters.maxContributionAmountNonAllowlisted"
          }
          $hasError={
            errors?.roundMetadata?.maciParameters
              ?.maxContributionAmountNonAllowlisted
          }
          placeholder="Enter the amount."
          data-testid="matching-funds-available"
          aria-describedby="price-currency"
          step="any"
        />
      </div>
    </div>
  );
}
