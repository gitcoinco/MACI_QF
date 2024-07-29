import { datadogLogs } from "@datadog/browser-logs";
import { datadogRum } from "@datadog/browser-rum";
import { Allo } from "common";
import { Dispatch } from "redux";
import { AcceptProfileOwnership, Status } from "../reducers/acceptOwnership";

export const ACCEPT_OWNERSHIP_STATUS = "ACCEPT_OWNERSHIP_STATUS";
export interface AcceptOwnershipStatus {
  type: typeof ACCEPT_OWNERSHIP_STATUS;
  status: Status;
}

export const OWNERSHIP_GRANTED = "OWNERSHIP_GRANTED";
export interface OwnershipGranted {
  type: typeof OWNERSHIP_GRANTED;
  id: number;
}

export const ACCEPT_OWNERSHIP_ERROR = "ACCEPT_OWNERSHIP__ERROR";
export interface AcceptOwnershipError {
  type: typeof ACCEPT_OWNERSHIP_ERROR;
  step: Status;
  error: string;
}

export type AcceptProfileOwnershipActions =
  | OwnershipGranted
  | AcceptOwnershipStatus
  | AcceptOwnershipError;

export const acceptOwnershipStatus = (
  status: Status
): AcceptProfileOwnershipActions => ({
  type: ACCEPT_OWNERSHIP_STATUS,
  status,
});

export const acceptOwnershipError = (
  error: string,
  step: Status
): AcceptProfileOwnershipActions => ({
  type: ACCEPT_OWNERSHIP_ERROR,
  error,
  step,
});

export const ownershipGranted = ({
  id,
}: AcceptProfileOwnership): AcceptProfileOwnershipActions => ({
  type: OWNERSHIP_GRANTED,
  id,
});

// todo: wire in metadata update
export const acceptOwnership =
  (allo: Allo, id?: string) => async (dispatch: Dispatch) => {
    if (!id) return;

    const result = allo.acceptProjectOwnership({
      projectId: id as `0x${string}`,
    });

    await result
      .on("transaction", (res) => {
        if (res.type === "success") {
          dispatch(acceptOwnershipStatus(Status.TransactionInitiated));
          console.log("Transaction", res.value);
        } else {
          console.error("Transaction Error", res.error);
          datadogRum.addError(res.error);
          datadogLogs.logger.warn("transaction error");
          dispatch(acceptOwnershipError("transaction error", Status.Error));
        }
      })
      .on("indexingStatus", async (res) => {
        if (res.type === "success") {
          dispatch(acceptOwnershipStatus(Status.Completed));
        } else {
          dispatch(acceptOwnershipStatus(Status.Error));
          console.log("Transaction Status Error", res.error);
        }
      })
      .execute();
  };
