import {
  AcceptProfileOwnershipActions,
  AcceptOwnershipError,
  OWNERSHIP_GRANTED,
  ACCEPT_OWNERSHIP_STATUS,
  ACCEPT_OWNERSHIP_ERROR,
} from "../actions/acceptOwnership";

export interface AcceptProfileOwnership {
  id: number;
  metaData: string;
  owner?: string;
}

export const enum Status {
  Undefined = 0,
  WaitingForSignature,
  TransactionInitiated,
  Completed,
  Error,
}

export interface AcceptProfileOwnershipState {
  status: Status;
  error: AcceptOwnershipError | undefined;
}

export const initialState: AcceptProfileOwnershipState = {
  status: Status.Undefined,
  error: undefined,
};

export const AcceptProfileOwnershipReducer = (
  state: AcceptProfileOwnershipState = initialState,
  action: AcceptProfileOwnershipActions | AcceptOwnershipError
): AcceptProfileOwnershipState => {
  switch (action.type) {
    case OWNERSHIP_GRANTED: {
      return {
        ...state,
        status: Status.Completed,
      };
    }

    case ACCEPT_OWNERSHIP_STATUS: {
      return {
        ...state,
        status: action.status,
      };
    }

    case ACCEPT_OWNERSHIP_ERROR: {
      return {
        ...state,
        status: Status.Error,
        error: action,
      };
    }

    default: {
      return state;
    }
  }
};
